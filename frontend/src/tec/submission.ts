import {
  ATEC_EXTENSION, AtecError, SubmissionPayload, openAsStudent, parseAtec, replayJournal, sealJournal,
  sealSubmission, verifyJournalChain
} from '@automatarium/secure-file'
import { APP_VERSION } from '/src/config'
import useJournalStore, { ModuleJournal } from '/src/stores/useJournalStore'
import useModuleStore, { ModuleProject, StoredModule, createNewModule } from '/src/stores/useModuleStore'
import useModulesStore from '/src/stores/useModulesStore'
import useStudentStore from '/src/stores/useStudentStore'
import { Project } from '/src/types/ProjectTypes'
import { newTab, openEntrega, saveCurrentTab, saveModule } from './entregas'
import { markNextLoadAsImport, recordCurrentTab } from './journalRecorder'
import { getStudentKeys, getTeacherPublicKey } from './keys'
import { flushSecureStorage } from './secureStorage'
import useProjectStore from '/src/stores/useProjectStore'

export { AtecError }

const slug = (s: string) => s
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9-_ ]/g, '')
  .trim().replace(/\s+/g, '_')
  .slice(0, 40) || 'entrega'

const requireStudent = () => {
  const student = useStudentStore.getState().student
  if (!student) throw new Error('No hay alumno registrado')
  return student
}

/** Construye el archivo .atec de la entrega abierta */
export const buildSubmissionFile = async (): Promise<File> => {
  const student = requireStudent()
  saveCurrentTab()
  recordCurrentTab('sync')
  const module = useModuleStore.getState().module
  if (!module) throw new Error('No hay ninguna entrega abierta')

  const journal: ModuleJournal = useJournalStore.getState().getJournal(module._id) ??
    { entries: [], lastGraphs: {}, importedExternal: [], createdAt: module.meta.dateCreated }
  const tamper = [...new Set([...(journal.tamperEvents ?? []), ...useStudentStore.getState().tamperEvents])]

  const payload: SubmissionPayload<StoredModule> = {
    format: 'automatarium-tec-payload',
    v: 1,
    student: { controlNumber: student.controlNumber, name: student.name, installId: student.installId },
    module,
    journal: await sealJournal(journal.entries),
    flags: { importedExternal: journal.importedExternal, localStoreTampered: tamper },
    appVersion: APP_VERSION,
    createdAt: journal.createdAt,
    savedAt: Date.now()
  }
  const file = await sealSubmission(payload, await getStudentKeys(student.controlNumber), await getTeacherPublicKey())
  useProjectStore.getState().setLastSaveDate(Date.now())
  await flushSecureStorage()
  const name = `${student.controlNumber}_${slug(module.meta.name)}${ATEC_EXTENSION}`
  return new File([JSON.stringify(file)], name, { type: 'application/json' })
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>, close: () => Promise<void> }> }>
}

/** Guarda la entrega como archivo .atec. Devuelve false si el alumno canceló. */
export const downloadSubmission = async (): Promise<boolean> => {
  const file = await buildSubmissionFile()
  const w = window as SavePickerWindow
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: file.name,
        types: [{ description: 'Entrega de Automatarium Tec', accept: { 'application/json': [ATEC_EXTENSION] } }]
      })
      const writable = await handle.createWritable()
      await writable.write(file)
      await writable.close()
      return true
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return false
      // Si el selector falla, se usa la descarga normal
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  return true
}

export const canShareFiles = () => typeof navigator.canShare === 'function' &&
  navigator.canShare({ files: [new File(['x'], 'x.atec', { type: 'application/json' })] })

/** Comparte la entrega con el menú del sistema (WhatsApp, correo, Drive...) */
export const shareSubmission = async () => {
  const file = await buildSubmissionFile()
  try {
    await navigator.share({ files: [file], title: file.name })
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') throw e
  }
}

/**
 * Abre un archivo .atec del propio alumno (por ejemplo, creado en su otro dispositivo).
 * Lanza AtecError si pertenece a otro número de control o fue alterado.
 */
export const openSubmissionFile = async (file: File, confirmReplace: (local: StoredModule, incoming: StoredModule) => boolean) => {
  const student = requireStudent()
  const atec = parseAtec(await file.text())
  const payload = await openAsStudent<StoredModule>(atec, student.controlNumber, await getStudentKeys(student.controlNumber))
  if (await verifyJournalChain(payload.journal) !== -1) {
    throw new AtecError('tampered', 'El archivo fue modificado fuera de Automatarium')
  }

  const incoming = payload.module
  const local = useModulesStore.getState().getModuleById(incoming._id)
  if (local && local.meta.dateEdited > payload.savedAt && !confirmReplace(local, incoming)) return false

  const lastGraphs = Object.fromEntries(replayJournal(payload.journal.entries))
  useJournalStore.getState().setJournal(incoming._id, {
    entries: payload.journal.entries,
    lastGraphs,
    importedExternal: payload.flags.importedExternal,
    tamperEvents: payload.flags.localStoreTampered,
    createdAt: payload.createdAt
  })
  openEntrega(incoming)
  return true
}

/* ---------------------------------------------------------------------------
 * Importaciones externas (JSON de Automatarium, JFLAP, URL compartida)
 * Se permiten, pero quedan marcadas en la bitácora para que el profesor lo sepa.
 * ------------------------------------------------------------------------- */

const tabFromExternal = (project: Project): ModuleProject => {
  const type = project.projectType ?? project.config?.type ?? 'FSA'
  const tab = newTab(type, project.meta?.name || 'Importado')
  return {
    ...tab,
    states: project.states ?? [],
    transitions: project.transitions ?? [],
    comments: project.comments ?? [],
    initialState: project.initialState ?? null,
    tests: project.tests ?? tab.tests,
    config: { ...tab.config, ...project.config, type, color: tab.config.color }
  } as ModuleProject
}

/** Agrega un proyecto externo como una pestaña nueva (o como una entrega nueva si no hay ninguna abierta) */
export const importExternalProject = (project: Project, { newEntrega = false } = {}) => {
  const tab = tabFromExternal(project)
  const module = newEntrega ? null : useModuleStore.getState().module
  markNextLoadAsImport(tab._id)
  if (module) {
    saveCurrentTab()
    useJournalStore.getState().record(module._id, tab._id, 'create', undefined, tab.projectType)
    useModuleStore.getState().upsertProject(tab)
    useProjectStore.getState().switchProject(tab)
    saveModule()
  } else {
    const entrega = createNewModule('')
    entrega.meta.name = tab.meta.name
    entrega.projects = [tab]
    useJournalStore.getState().record(entrega._id, tab._id, 'create', undefined, tab.projectType)
    openEntrega(entrega)
  }
}

/** Importa un módulo externo como una entrega nueva con todas sus pestañas marcadas como importadas */
export const importExternalModule = (external: StoredModule) => {
  const entrega = createNewModule('')
  entrega.meta.name = external.meta?.name || 'Importado'
  entrega.projects = (external.projects ?? []).map(tabFromExternal)
  if (!entrega.projects.length) return
  const journal = useJournalStore.getState()
  for (const tab of entrega.projects) {
    journal.record(entrega._id, tab._id, 'create', undefined, tab.projectType)
    journal.record(entrega._id, tab._id, 'import', tab)
  }
  openEntrega(entrega)
}
