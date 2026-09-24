import { StateStorage } from 'zustand/middleware'
import { decryptLocal, encryptLocal } from '@automatarium/secure-file'
import useStudentStore from '/src/stores/useStudentStore'
import { getStudentKeys } from './keys'

/**
 * Almacenamiento cifrado para zustand: IndexedDB + AES-GCM con la llave local del alumno.
 * Si un registro fue modificado desde fuera de la app, no pasa la verificación: se usa la
 * copia anterior (.bak) y se anota el evento para que viaje en la siguiente entrega.
 */

const DB_NAME = 'automatarium-tec'
const STORE = 'kv'
const WRITE_DELAY = 300

let dbPromise: Promise<IDBDatabase> | null = null
const openDB = () => {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const tx = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const idbGet = (key: string) => tx<string | undefined>('readonly', s => s.get(key))
const idbSet = (key: string, value: string) => tx('readwrite', s => s.put(value, key))
const idbDel = (key: string) => tx('readwrite', s => s.delete(key))

const localKey = async () => {
  const student = useStudentStore.getState().student
  if (!student) throw new Error('No hay alumno registrado')
  return (await getStudentKeys(student.controlNumber)).localKey
}

// Escrituras agrupadas: zustand escribe en cada cambio (por ejemplo, al arrastrar un estado)
const pending = new Map<string, string>()
let timer: ReturnType<typeof setTimeout> | null = null
let writing: Promise<void> = Promise.resolve()

const flush = () => {
  timer = null
  const batch = [...pending]
  pending.clear()
  writing = writing.then(async () => {
    const key = await localKey()
    for (const [name, value] of batch) {
      const encrypted = await encryptLocal(key, name, value)
      const prev = await idbGet(name)
      if (prev) await idbSet(`${name}.bak`, prev)
      await idbSet(name, encrypted)
    }
  }).catch(e => console.error('No se pudo guardar localmente', e))
  return writing
}

/** Espera a que terminen las escrituras pendientes */
export const flushSecureStorage = () => (pending.size ? flush() : writing)

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (pending.size) flush() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pending.size) flush() })
}

export const secureStorage: StateStorage = {
  getItem: async name => {
    await writing
    if (pending.has(name)) return pending.get(name)
    const stored = await idbGet(name)
    if (stored == null) return null
    const key = await localKey()
    const plain = await decryptLocal(key, name, stored)
    if (plain !== null) return plain

    // El registro fue alterado: se usa la copia anterior y se deja constancia
    console.warn(`El registro local "${name}" no pasó la verificación de integridad`)
    useStudentStore.getState().addTamperEvent()
    const backup = await idbGet(`${name}.bak`)
    return backup ? decryptLocal(key, name, backup) : null
  },
  setItem: (name, value) => {
    pending.set(name, value)
    timer ??= setTimeout(flush, WRITE_DELAY)
  },
  removeItem: async name => {
    pending.delete(name)
    await writing
    await idbDel(name)
    await idbDel(`${name}.bak`)
  }
}

/** Borra todo el trabajo local y la identidad del alumno */
export const resetApp = async () => {
  pending.clear()
  if (timer) clearTimeout(timer)
  const db = await openDB()
  db.close()
  dbPromise = null
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  Object.keys(localStorage)
    .filter(k => k.startsWith('automatarium-') && k !== 'automatarium-preferences')
    .forEach(k => localStorage.removeItem(k))
  window.location.hash = '#/'
  window.location.reload()
}
