import { fromB64, toB64, utf8 } from './encoding'

const HKDF_SALT = utf8('automatarium-tec/v1')

/** Normaliza el número de control para que "  c19400123 " y "C19400123" sean el mismo alumno */
export const normalizeControlNumber = (controlNumber: string): string =>
  controlNumber.trim().toUpperCase()

export interface StudentKeys {
  /** Envuelve y desenvuelve la llave de contenido de cada archivo .atec */
  wrapKey: CryptoKey
  /** Cifra el almacenamiento local (IndexedDB) de la app */
  localKey: CryptoKey
}

const importAppSecret = (appSecret: ArrayBuffer) =>
  crypto.subtle.importKey('raw', appSecret, 'HKDF', false, ['deriveKey'])

/**
 * Deriva las llaves del alumno a partir del secreto de la app y su número de control.
 * Como solo depende de esos dos valores, el mismo número de control obtiene las mismas
 * llaves en cualquier dispositivo.
 */
export const deriveStudentKeys = async (appSecret: ArrayBuffer, controlNumber: string): Promise<StudentKeys> => {
  const base = await importAppSecret(appSecret)
  const cn = normalizeControlNumber(controlNumber)
  const derive = (info: string, algorithm: AesKeyGenParams, usages: KeyUsage[]) => crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: utf8(info) },
    base, algorithm, false, usages
  )
  return {
    wrapKey: await derive(`wrap:${cn}`, { name: 'AES-KW', length: 256 }, ['wrapKey', 'unwrapKey']),
    localKey: await derive(`local:${cn}`, { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt'])
  }
}

/* ---------------------------------------------------------------------------
 * Llaves del profesor (ECDH P-256)
 * ------------------------------------------------------------------------- */

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const
const PBKDF2_ITERATIONS = 600_000

export interface TeacherKeyFile {
  format: 'automatarium-tec-teacher-key'
  v: 1
  createdAt: number
  publicKey: JsonWebKey
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: number, salt: string }
  iv: string
  /** Llave privada PKCS#8 cifrada con AES-GCM bajo la contraseña del profesor */
  encryptedPrivateKey: string
}

export const generateTeacherKeyPair = () =>
  crypto.subtle.generateKey(ECDH, true, ['deriveBits']) as Promise<CryptoKeyPair>

export const importTeacherPublicKey = (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', { ...jwk, key_ops: [] }, ECDH, true, [])

const passwordKey = async (password: string, salt: ArrayBuffer, iterations: number) => {
  const base = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

/** Exporta el par de llaves del profesor, con la privada protegida por contraseña */
export const exportTeacherKeyFile = async (pair: CryptoKeyPair, password: string, iterations = PBKDF2_ITERATIONS): Promise<TeacherKeyFile> => {
  if (password.length < 8) throw new Error('La contraseña del profesor debe tener al menos 8 caracteres')
  const salt = crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await passwordKey(password, salt, iterations)
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pkcs8)
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return {
    format: 'automatarium-tec-teacher-key',
    v: 1,
    createdAt: Date.now(),
    publicKey: { kty, crv, x, y },
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    iv: toB64(iv),
    encryptedPrivateKey: toB64(encrypted)
  }
}

/** Abre el archivo de llave del profesor. Lanza un error si la contraseña es incorrecta. */
export const importTeacherKeyFile = async (file: TeacherKeyFile, password: string): Promise<CryptoKey> => {
  if (file?.format !== 'automatarium-tec-teacher-key') throw new Error('No es un archivo de llave de profesor')
  const key = await passwordKey(password, fromB64(file.kdf.salt), file.kdf.iterations)
  let pkcs8: ArrayBuffer
  try {
    pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, key, fromB64(file.encryptedPrivateKey))
  } catch {
    throw new Error('Contraseña incorrecta')
  }
  return crypto.subtle.importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits'])
}

/** Deriva la llave AES-KW compartida entre una llave efímera y la llave del profesor */
export const teacherWrapKey = async (privateKey: CryptoKey, publicKey: CryptoKey, epkRaw: ArrayBuffer) => {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: epkRaw, info: utf8('teacher-wrap') },
    base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']
  )
}

export const importEphemeralPublicKey = (raw: ArrayBuffer) =>
  crypto.subtle.importKey('raw', raw, ECDH, true, [])
