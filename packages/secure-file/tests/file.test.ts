import {
  AtecError, AtecFile, SubmissionPayload, decryptLocal, deriveStudentKeys, encryptLocal, exportTeacherKeyFile,
  fromB64, generateTeacherKeyPair, importTeacherKeyFile, importTeacherPublicKey, openAsStudent, openAsTeacher,
  parseAtec, sealJournal, sealSubmission, toB64
} from '../src'

const APP_SECRET = new Uint8Array(32).fill(7).buffer

const payloadFor = (controlNumber: string): SubmissionPayload<{ projects: string[] }> => ({
  format: 'automatarium-tec-payload',
  v: 1,
  student: { controlNumber, name: 'Ana López', installId: 'dev-1' },
  module: { projects: ['q0 -> q1'] },
  journal: { entries: [], hashes: [] },
  flags: { importedExternal: [], localStoreTampered: [] },
  appVersion: 'test',
  createdAt: 1,
  savedAt: 2
})

const setup = async () => {
  const pair = await generateTeacherKeyPair()
  const keyFile = await exportTeacherKeyFile(pair, 'profesor-secreto', 1000)
  const teacherPub = await importTeacherPublicKey(keyFile.publicKey)
  const ana = await deriveStudentKeys(APP_SECRET, 'C19400123')
  const file = await sealSubmission(payloadFor('C19400123'), ana, teacherPub)
  return { keyFile, teacherPub, ana, file }
}

const expectCode = async (p: Promise<unknown>, code: AtecError['code']) => {
  await expect(p).rejects.toBeInstanceOf(AtecError)
  await expect(p).rejects.toMatchObject({ code })
}

test('el alumno abre su propia entrega, también en "otro dispositivo"', async () => {
  const { file } = await setup()
  // Otro dispositivo = llaves derivadas de nuevo a partir del mismo número de control
  const sameStudentOtherDevice = await deriveStudentKeys(APP_SECRET, '  c19400123 ')
  const text = JSON.stringify(file)
  const payload = await openAsStudent(parseAtec(text), 'c19400123', sameStudentOtherDevice)
  expect(payload.module).toEqual({ projects: ['q0 -> q1'] })
  expect(payload.student.name).toBe('Ana López')
})

test('otro número de control no puede abrir la entrega', async () => {
  const { file } = await setup()
  const beto = await deriveStudentKeys(APP_SECRET, 'C19400999')
  await expectCode(openAsStudent(file, 'C19400999', beto), 'wrong-student')
})

test('cambiar el número de control del encabezado no sirve para abrirla', async () => {
  const { file } = await setup()
  const beto = await deriveStudentKeys(APP_SECRET, 'C19400999')
  await expectCode(openAsStudent({ ...file, controlNumber: 'C19400999' }, 'C19400999', beto), 'tampered')
})

test('cambiar un solo byte se detecta como alteración', async () => {
  const { file, ana } = await setup()
  const bytes = new Uint8Array(fromB64(file.ciphertext))
  bytes[5] ^= 1
  const altered: AtecFile = { ...file, ciphertext: toB64(bytes) }
  await expectCode(openAsStudent(altered, 'C19400123', ana), 'tampered')
})

test('cambiar el nombre en el encabezado se detecta como alteración', async () => {
  const { file, ana, keyFile } = await setup()
  await expectCode(openAsStudent({ ...file, name: 'Otra persona' }, 'C19400123', ana), 'tampered')
  const teacherKey = await importTeacherKeyFile(keyFile, 'profesor-secreto')
  await expectCode(openAsTeacher({ ...file, name: 'Otra persona' }, teacherKey), 'tampered')
})

test('el profesor abre cualquier entrega con su llave privada', async () => {
  const { keyFile, teacherPub } = await setup()
  const beto = await deriveStudentKeys(APP_SECRET, 'C19400999')
  const betoFile = await sealSubmission(payloadFor('C19400999'), beto, teacherPub)
  const teacherKey = await importTeacherKeyFile(keyFile, 'profesor-secreto')
  const payload = await openAsTeacher(betoFile, teacherKey)
  expect(payload.student.controlNumber).toBe('C19400999')
})

test('la llave del profesor requiere la contraseña correcta', async () => {
  const { keyFile } = await setup()
  await expect(importTeacherKeyFile(keyFile, 'incorrecta')).rejects.toThrow('Contraseña incorrecta')
})

test('otro profesor no puede abrir la entrega', async () => {
  const { file } = await setup()
  const other = await exportTeacherKeyFile(await generateTeacherKeyPair(), 'otro-profesor', 1000)
  await expectCode(openAsTeacher(file, await importTeacherKeyFile(other, 'otro-profesor')), 'tampered')
})

test('un archivo que no es .atec se rechaza', () => {
  expect(() => parseAtec('{"states":[]}')).toThrow(AtecError)
  expect(() => parseAtec('no es json')).toThrow(AtecError)
})

test('el almacenamiento local detecta alteraciones y registros movidos', async () => {
  const { ana } = await setup()
  const stored = await encryptLocal(ana.localKey, 'automatarium-modules', '{"a":1}')
  expect(await decryptLocal(ana.localKey, 'automatarium-modules', stored)).toBe('{"a":1}')
  expect(await decryptLocal(ana.localKey, 'automatarium-project', stored)).toBeNull()
  expect(await decryptLocal(ana.localKey, 'automatarium-modules', stored.slice(0, -4) + 'AAAA')).toBeNull()
})

test('la bitácora sellada viaja dentro de la entrega', async () => {
  const { teacherPub, ana, keyFile } = await setup()
  const journal = await sealJournal([{ t: 1, dev: 'd', tab: 'x', k: 'create' }])
  const file = await sealSubmission({ ...payloadFor('C19400123'), journal }, ana, teacherPub)
  const payload = await openAsTeacher(file, await importTeacherKeyFile(keyFile, 'profesor-secreto'))
  expect(payload.journal).toEqual(journal)
})
