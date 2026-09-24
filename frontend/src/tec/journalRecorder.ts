import useJournalStore from '/src/stores/useJournalStore'
import useModuleStore from '/src/stores/useModuleStore'
import useProjectStore from '/src/stores/useProjectStore'

/**
 * Registra en la bitácora cada cambio del editor. Se engancha al historial de deshacer:
 * cada commit, deshacer o rehacer produce una entrada con la diferencia del autómata.
 */

/** Pestañas cuyo siguiente registro debe marcarse como importación externa */
const pendingImports = new Set<string>()

export const markNextLoadAsImport = (tabId: string) => pendingImports.add(tabId)

/** Registra el estado actual de la pestaña abierta (por ejemplo, justo antes de entregar) */
export const recordCurrentTab = (kind: 'edit' | 'sync' = 'sync') => {
  const project = useProjectStore.getState().project
  const module = useModuleStore.getState().module
  if (!project || !module?.projects.some(p => p._id === project._id)) return
  useJournalStore.getState().record(module._id, project._id, kind, project)
}

let started = false

export const startJournalRecorder = () => {
  if (started) return
  started = true
  useProjectStore.subscribe((s, prev) => {
    const project = s.project
    const module = useModuleStore.getState().module
    if (!project || !module?.projects.some(p => p._id === project._id)) return

    if (pendingImports.delete(project._id)) {
      useJournalStore.getState().record(module._id, project._id, 'import', project)
      return
    }
    if (project._id !== prev.project?._id) {
      // Se abrió otra pestaña: si su contenido no coincide con la bitácora, se registra como 'sync'
      useJournalStore.getState().record(module._id, project._id, 'sync', project)
      return
    }
    if (s.history !== prev.history || s.historyPointer !== prev.historyPointer) {
      useJournalStore.getState().record(module._id, project._id, 'edit', project)
    }
  })
}
