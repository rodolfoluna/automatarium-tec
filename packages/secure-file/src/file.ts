import { canonicalJSON, fromB64, fromUtf8, toB64, utf8 } from './encoding'
import { StudentKeys, importEphemeralPublicKey, normalizeControlNumber, teacherWrapKey } from './keys'
import { SealedJournal } from './journal'

export const ATEC_FORMAT = 'automatarium-tec'
export const ATEC_EXTENSION = '.atec'

/** Encabezado en claro del archivo .atec. Todo el encabezado es AAD del cifrado. */
export interface AtecHeader {
  format: typeof ATEC_FORMAT
  v: 1
  controlNumber: string
  name: string
  savedAt: number
  iv: string
  wrapStudent: string
  wrapTeacher: { epk: string, wrapped: string }
}

export interface AtecFile extends AtecHeader {
  ciphertext: string
}

export interface SubmissionFlags {
  /** _id de las pestañas que recibieron contenido importado desde fuera de la app */
  importedExternal: string[]
  /** Fechas en que el almacenamiento local no pasó la verificación */
  localStoreTampered: number[]
}

export interface SubmissionPayload<M = unknown> {
  format: 'automatarium-tec-payload'
  v: 1
  student: { controlNumber: string, name: string, installId: string }
  /** El módulo con todas las pestañas (StoredModule de Automatarium) */
  module: M
  journal: SealedJournal
  flags: SubmissionFlags
  appVersion: string
  createdAt: number
  savedAt: number
}

export class AtecError extends Error {
  constructor (public code: 'not-atec' | 'wrong-student' | 'tampered' | 'unsupported', message: string) {
    super(message)
  }
}

const headerAAD = (h: AtecHeader) => utf8(canonicalJSON({
  format: h.format,
  v: h.v,
  controlNumber: h.controlNumber,
  name: h.name,
  savedAt: h.savedAt,
  iv: h.iv,
  wrapStudent: h.wrapStudent,
  wrapTeacher: h.wrapTeacher
}))

/**
 * Cifra una entrega. La llave de contenido (CEK) se envuelve dos veces:
 * con la llave del alumno y con la llave pública del profesor.
 */
export const sealSubmission = async <M>(
  payload: SubmissionPayload<M>,
  studentKeys: StudentKeys,
  teacherPublicKey: CryptoKey
): Promise<AtecFile> => {
  const cek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // Envoltura para el profesor: ECDH con una llave efímera
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const epkRaw = await crypto.subtle.exportKey('raw', ephemeral.publicKey)
  const tKey = await teacherWrapKey(ephemeral.privateKey, teacherPublicKey, epkRaw)

  const header: AtecHeader = {
    format: ATEC_FORMAT,
    v: 1,
    controlNumber: normalizeControlNumber(payload.student.controlNumber),
    name: payload.student.name,
    savedAt: payload.savedAt,
    iv: toB64(iv),
    wrapStudent: toB64(await crypto.subtle.wrapKey('raw', cek, studentKeys.wrapKey, 'AES-KW')),
    wrapTeacher: {
      epk: toB64(epkRaw),
      wrapped: toB64(await crypto.subtle.wrapKey('raw', cek, tKey, 'AES-KW'))
    }
  }
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: headerAAD(header) },
    cek,
    utf8(JSON.stringify(payload))
  )
  return { ...header, ciphertext: toB64(ciphertext) }
}

/** Lee el texto de un archivo y verifica que tenga forma de .atec */
export const parseAtec = (text: string): AtecFile => {
  let file: AtecFile
  try {
    file = JSON.parse(text)
  } catch {
    throw new AtecError('not-atec', 'El archivo no es una entrega de Automatarium Tec')
  }
  if (file?.format !== ATEC_FORMAT) throw new AtecError('not-atec', 'El archivo no es una entrega de Automatarium Tec')
  if (file.v !== 1) throw new AtecError('unsupported', 'La versión del archivo no es compatible con esta app')
  return file
}

const decryptWithCek = async <M>(file: AtecFile, cek: CryptoKey): Promise<SubmissionPayload<M>> => {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(file.iv), additionalData: headerAAD(file) },
      cek,
      fromB64(file.ciphertext)
    )
    return JSON.parse(fromUtf8(plain))
  } catch {
    throw new AtecError('tampered', 'El archivo fue modificado fuera de Automatarium')
  }
}

const unwrapCek = async (wrapped: string, key: CryptoKey) => {
  try {
    return await crypto.subtle.unwrapKey('raw', fromB64(wrapped), key, 'AES-KW', 'AES-GCM', false, ['decrypt'])
  } catch {
    return null
  }
}

/** Abre una entrega como alumno. Solo funciona con el mismo número de control. */
export const openAsStudent = async <M>(file: AtecFile, controlNumber: string, studentKeys: StudentKeys): Promise<SubmissionPayload<M>> => {
  if (normalizeControlNumber(file.controlNumber) !== normalizeControlNumber(controlNumber)) {
    throw new AtecError('wrong-student', `Este archivo pertenece al número de control ${file.controlNumber}`)
  }
  const cek = await unwrapCek(file.wrapStudent, studentKeys.wrapKey)
  if (!cek) throw new AtecError('tampered', 'El archivo fue modificado fuera de Automatarium')
  const payload = await decryptWithCek<M>(file, cek)
  if (normalizeControlNumber(payload.student.controlNumber) !== normalizeControlNumber(file.controlNumber)) {
    throw new AtecError('tampered', 'El archivo fue modificado fuera de Automatarium')
  }
  return payload
}

/** Abre cualquier entrega con la llave privada del profesor */
export const openAsTeacher = async <M>(file: AtecFile, teacherPrivateKey: CryptoKey): Promise<SubmissionPayload<M>> => {
  let cek: CryptoKey | null = null
  try {
    const epkRaw = fromB64(file.wrapTeacher.epk)
    const epk = await importEphemeralPublicKey(epkRaw)
    cek = await unwrapCek(file.wrapTeacher.wrapped, await teacherWrapKey(teacherPrivateKey, epk, epkRaw))
  } catch {
    cek = null
  }
  if (!cek) throw new AtecError('tampered', 'No se pudo abrir: el archivo fue alterado o se cifró para otro profesor')
  return decryptWithCek<M>(file, cek)
}

/* ---------------------------------------------------------------------------
 * Cifrado del almacenamiento local
 * ------------------------------------------------------------------------- */

/** Cifra un texto con la llave local del alumno. `name` se liga como AAD para evitar mover registros. */
export const encryptLocal = async (localKey: CryptoKey, name: string, value: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(name) }, localKey, utf8(value))
  return toB64(iv) + '.' + toB64(ct)
}

/** Descifra un registro local. Devuelve null si fue alterado. */
export const decryptLocal = async (localKey: CryptoKey, name: string, stored: string): Promise<string | null> => {
  try {
    const [iv, ct] = stored.split('.')
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: utf8(name) }, localKey, fromB64(ct))
    return fromUtf8(plain)
  } catch {
    return null
  }
}
