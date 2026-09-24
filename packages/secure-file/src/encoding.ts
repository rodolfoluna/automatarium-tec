// Utilidades de codificación compartidas por el formato .atec

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const utf8 = (s: string): ArrayBuffer => encoder.encode(s).buffer as ArrayBuffer
export const fromUtf8 = (b: ArrayBuffer | Uint8Array): string => decoder.decode(b)

export const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export const fromB64 = (b64: string): ArrayBuffer => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer as ArrayBuffer
}

export const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

/**
 * JSON con llaves ordenadas, para que el mismo objeto siempre produzca los mismos bytes
 * (se usa como AAD y para los hashes de la bitácora).
 */
export const canonicalJSON = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map(v => canonicalJSON(v === undefined ? null : v)).join(',') + ']'
  const obj = value as Record<string, unknown>
  return '{' + Object.keys(obj)
    .filter(k => obj[k] !== undefined)
    .sort()
    .map(k => JSON.stringify(k) + ':' + canonicalJSON(obj[k]))
    .join(',') + '}'
}

export const sha256Hex = async (s: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', utf8(s)))
