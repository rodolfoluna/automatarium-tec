import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeControlNumber } from '@automatarium/secure-file'

export interface Student {
  controlNumber: string
  name: string
  /** Identifica esta instalación de la app (dispositivo + navegador) */
  installId: string
  registeredAt: number
}

interface StudentStore {
  student: Student | null
  /** Fechas en que el almacenamiento local no pasó la verificación de integridad */
  tamperEvents: number[]
  register: (controlNumber: string, name: string) => void
  addTamperEvent: () => void
}

/**
 * Identidad del alumno. Se registra una sola vez; para cambiarla hay que restablecer la app,
 * lo que borra todo el trabajo local (ver `resetApp`).
 */
const useStudentStore = create<StudentStore>()(persist(set => ({
  student: null,
  tamperEvents: [],
  register: (controlNumber, name) => set(s => s.student
    ? s
    : {
        student: {
          controlNumber: normalizeControlNumber(controlNumber),
          name: name.trim().replace(/\s+/g, ' '),
          installId: crypto.randomUUID(),
          registeredAt: Date.now()
        }
      }),
  addTamperEvent: () => set(s => ({ tamperEvents: [...s.tamperEvents, Date.now()] }))
}), {
  name: 'automatarium-tec-student'
}))

export default useStudentStore
