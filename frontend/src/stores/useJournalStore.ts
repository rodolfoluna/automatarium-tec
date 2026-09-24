import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { JournalEntry, JournalGraph, JournalKind, diffGraph, emptyGraph, pickGraph } from '@automatarium/secure-file'
import { secureStorage } from '/src/tec/secureStorage'
import useStudentStore from './useStudentStore'

export interface ModuleJournal {
  entries: JournalEntry[]
  /** Última versión registrada de cada pestaña, para calcular la siguiente diferencia */
  lastGraphs: Record<string, JournalGraph>
  /** Pestañas que recibieron contenido importado desde fuera de la app */
  importedExternal: string[]
  /** Alteraciones del almacenamiento local heredadas de otros dispositivos */
  tamperEvents?: number[]
  createdAt: number
}

interface JournalStore {
  journals: Record<string, ModuleJournal>
  /**
   * Registra el estado actual de una pestaña. Solo agrega una entrada si algo cambió,
   * salvo en create/rename/delete que siempre se registran.
   */
  record: (moduleId: string, tabId: string, kind: JournalKind, graph?: JournalGraph, name?: string) => void
  getJournal: (moduleId: string) => ModuleJournal | undefined
  setJournal: (moduleId: string, journal: ModuleJournal) => void
  removeJournal: (moduleId: string) => void
}

const newJournal = (): ModuleJournal => ({ entries: [], lastGraphs: {}, importedExternal: [], createdAt: Date.now() })

const useJournalStore = create<JournalStore>()(persist((set, get) => ({
  journals: {},

  record: (moduleId, tabId, kind, graph, name) => set(s => {
    const journal = s.journals[moduleId] ?? newJournal()
    const prev = journal.lastGraphs[tabId] ?? emptyGraph()
    const next = graph ? pickGraph(graph) : prev
    const d = kind === 'delete' ? null : diffGraph(prev, next)
    if (!d && (kind === 'edit' || kind === 'sync' || kind === 'import')) return s

    const entry: JournalEntry = {
      t: Date.now(),
      dev: useStudentStore.getState().student?.installId ?? 'desconocido',
      tab: tabId,
      k: kind,
      ...(d ? { d } : {}),
      ...(name !== undefined ? { n: name } : {})
    }
    const lastGraphs = { ...journal.lastGraphs }
    if (kind === 'delete') delete lastGraphs[tabId]
    else lastGraphs[tabId] = next

    return {
      journals: {
        ...s.journals,
        [moduleId]: {
          ...journal,
          entries: [...journal.entries, entry],
          lastGraphs,
          importedExternal: kind === 'import' && !journal.importedExternal.includes(tabId)
            ? [...journal.importedExternal, tabId]
            : journal.importedExternal
        }
      }
    }
  }),

  getJournal: moduleId => get().journals[moduleId],

  setJournal: (moduleId, journal) => set(s => ({ journals: { ...s.journals, [moduleId]: journal } })),

  removeJournal: moduleId => set(s => {
    const journals = { ...s.journals }
    delete journals[moduleId]
    return { journals }
  })
}), {
  name: 'automatarium-journal',
  storage: createJSONStorage(() => secureStorage),
  skipHydration: true
}))

export default useJournalStore
