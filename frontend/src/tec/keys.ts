import { StudentKeys, deriveStudentKeys, fromB64, importTeacherPublicKey } from '@automatarium/secure-file'
import { APP_SECRET_B64, TEACHER_PUBLIC_KEY } from './config'

let studentKeys: { controlNumber: string, keys: Promise<StudentKeys> } | null = null
let teacherKey: Promise<CryptoKey> | null = null

/** Llaves del alumno (se derivan una sola vez por número de control) */
export const getStudentKeys = (controlNumber: string): Promise<StudentKeys> => {
  if (studentKeys?.controlNumber !== controlNumber) {
    studentKeys = { controlNumber, keys: deriveStudentKeys(fromB64(APP_SECRET_B64), controlNumber) }
  }
  return studentKeys.keys
}

export const getTeacherPublicKey = (): Promise<CryptoKey> => {
  teacherKey ??= importTeacherPublicKey(TEACHER_PUBLIC_KEY)
  return teacherKey
}
