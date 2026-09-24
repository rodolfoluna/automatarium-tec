import devKeys from './dev-keys.json'

/**
 * Configuración del modo Tec. Los valores reales se inyectan al compilar desde
 * .env.production.local (lo genera `yarn workspace frontend keygen`).
 * Si faltan, se usan las llaves de desarrollo y la app muestra un aviso.
 */
const envAppSecret = process.env.ATEC_APP_SECRET
const envTeacherKey = process.env.ATEC_TEACHER_PUBLIC_KEY

export const USING_DEV_KEYS = !envAppSecret || !envTeacherKey

export const APP_SECRET_B64: string = envAppSecret || devKeys.appSecret

export const TEACHER_PUBLIC_KEY: JsonWebKey = envTeacherKey ? JSON.parse(envTeacherKey) : devKeys.teacherPublicKey

/** Formato válido del número de control (después de quitar espacios y pasar a mayúsculas) */
const envControlRegex = process.env.ATEC_CONTROL_REGEX
// Ojo: se usa una expresión literal porque el minificador perdía la diagonal de '\d' al combinar cadenas
export const CONTROL_NUMBER_PATTERN = envControlRegex ? new RegExp(envControlRegex) : /^[A-Z]?\d{8,9}$/

/** Nombre de la institución que se muestra en la app */
export const INSTITUTION_NAME = process.env.ATEC_INSTITUTION || 'Tecnológico Nacional de México'
