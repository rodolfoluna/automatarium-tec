import { DEFAULT_PROJECT_COLOR } from '/src/config'
import useJournalStore from '/src/stores/useJournalStore'
import useModuleStore, { ModuleProject, StoredModule, createNewModule, createNewModuleProject } from '/src/stores/useModuleStore'
import useModulesStore from '/src/stores/useModulesStore'
import useProjectStore from '/src/stores/useProjectStore'
import { ProjectType } from '/src/types/ProjectTypes'

/**
 * En Automatarium Tec todo el trabajo del alumno es una "entrega": un módulo de Automatarium
 * con una o más pestañas (proyectos), cada una con su propio autómata FSA, PDA o TM.
 */

const TYPE_LABEL: Record<ProjectType, string> = { FSA: 'AF', PDA: 'AP', TM: 'MT' }

export const newTab = (type: ProjectType, name: string): ModuleProject => {
  const project = createNewModuleProject(type, name)
  project.config.color = DEFAULT_PROJECT_COLOR[type]
  return project
}

const nextTabName = (module: StoredModule, type: ProjectType) => {
  const n = module.projects.filter(p => p.projectType === type).length + 1
  return `${TYPE_LABEL[type]} ${n}`
}

/** Guarda la pestaña abierta dentro de la entrega y la entrega en la lista local */
export const saveCurrentTab = () => {
  const project = useProjectStore.getState().project
  const moduleStore = useModuleStore.getState()
  if (!project || !moduleStore.module) return
  if (moduleStore.module.projects.some(p => p._id === project._id)) {
    moduleStore.upsertProject({ ...project, meta: { ...project.meta, dateEdited: Date.now() } })
  }
  saveModule()
}

/** Copia la entrega abierta a la lista de entregas */
export const saveModule = () => {
  const module = useModuleStore.getState().module
  if (!module) return
  useModulesStore.getState().upsertModule({ ...module, meta: { ...module.meta, dateEdited: Date.now() } })
}

/** Crea una entrega nueva con una primera pestaña y la abre */
export const createEntrega = (type: ProjectType): StoredModule => {
  const module = createNewModule('')
  const tab = newTab(type, `${TYPE_LABEL[type]} 1`)
  module.projects = [tab]
  useJournalStore.getState().record(module._id, tab._id, 'create', undefined, type)
  openEntrega(module)
  return module
}

/** Abre una entrega existente en su primera pestaña */
export const openEntrega = (module: StoredModule, tabId?: string) => {
  const moduleStore = useModuleStore.getState()
  moduleStore.setModule(module)
  moduleStore.setShowModuleWindow(false)
  useModulesStore.getState().upsertModule(module)
  const tab = module.projects.find(p => p._id === tabId) ?? module.projects[0]
  useProjectStore.setState({ histories: {} })
  useProjectStore.getState().set(tab)
}

export const switchTab = (tabId: string) => {
  const current = useProjectStore.getState().project
  if (current?._id === tabId) return
  saveCurrentTab()
  const tab = useModuleStore.getState().module?.projects.find(p => p._id === tabId)
  if (tab) useProjectStore.getState().switchProject(tab)
}

export const addTab = (type: ProjectType) => {
  const module = useModuleStore.getState().module
  if (!module) return
  saveCurrentTab()
  const tab = newTab(type, nextTabName(module, type))
  useModuleStore.getState().upsertProject(tab)
  useJournalStore.getState().record(module._id, tab._id, 'create', undefined, type)
  useProjectStore.getState().switchProject(tab)
  saveModule()
}

export const closeTab = (tabId: string) => {
  const moduleStore = useModuleStore.getState()
  const module = moduleStore.module
  if (!module || module.projects.length <= 1) return
  saveCurrentTab()
  const index = module.projects.findIndex(p => p._id === tabId)
  moduleStore.deleteProject(tabId)
  moduleStore.deleteQuestion(tabId)
  useJournalStore.getState().record(module._id, tabId, 'delete')
  const histories = { ...useProjectStore.getState().histories }
  delete histories[tabId]
  useProjectStore.setState({ histories })
  if (useProjectStore.getState().project?._id === tabId) {
    const remaining = useModuleStore.getState().module.projects
    useProjectStore.getState().switchProject(remaining[Math.min(index, remaining.length - 1)])
  }
  saveModule()
}

export const renameTab = (tabId: string, name: string) => {
  const clean = name.trim()
  const moduleStore = useModuleStore.getState()
  const tab = moduleStore.module?.projects.find(p => p._id === tabId)
  if (!clean || !tab || tab.meta.name === clean) return
  if (useProjectStore.getState().project?._id === tabId) useProjectStore.getState().setName(clean)
  moduleStore.upsertProject({ ...tab, meta: { ...tab.meta, name: clean } })
  useJournalStore.getState().record(moduleStore.module._id, tabId, 'rename', undefined, clean)
  saveCurrentTab()
}

export const moveTab = (from: number, to: number) => {
  const moduleStore = useModuleStore.getState()
  const projects = [...(moduleStore.module?.projects ?? [])]
  if (from === to || from < 0 || to < 0 || from >= projects.length || to >= projects.length) return
  const [moved] = projects.splice(from, 1)
  projects.splice(to, 0, moved)
  moduleStore.setProjects(projects)
  saveCurrentTab()
}

/** Borra una entrega local y su bitácora */
export const deleteEntrega = (moduleId: string) => {
  useModulesStore.getState().deleteModule(moduleId)
  useJournalStore.getState().removeJournal(moduleId)
  if (useModuleStore.getState().module?._id === moduleId) useModuleStore.getState().setModule(null)
}
