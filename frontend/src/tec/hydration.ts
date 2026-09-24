import { useEffect, useState } from 'react'
import { useJournalStore, useModuleStore, useModulesStore, useProjectsStore, useProjectStore, useStudentStore } from '/src/stores'
import { startJournalRecorder } from './journalRecorder'

let hydration: Promise<void> | null = null

/** Descifra y carga el trabajo local del alumno. Solo se puede hacer después de registrarlo. */
export const hydrateSecureStores = () => {
  hydration ??= (async () => {
    await useModulesStore.persist.rehydrate()
    await useModuleStore.persist.rehydrate()
    await useJournalStore.persist.rehydrate()
    await useProjectsStore.persist.rehydrate()
    await useProjectStore.persist.rehydrate()
    startJournalRecorder()
  })()
  return hydration
}

/** true cuando hay alumno registrado y su trabajo ya se cargó */
export const useSecureHydration = () => {
  const student = useStudentStore(s => s.student)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!student) return
    hydrateSecureStores()
      .then(() => setReady(true))
      .catch(e => { console.error(e); setReady(true) })
  }, [student])
  return { student, ready }
}
