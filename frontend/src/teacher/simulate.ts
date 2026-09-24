import { simulateFSA } from '@automatarium/simulation/src/simulateFSA'
import { simulatePDA } from '@automatarium/simulation/src/simulatePDA'
import { expandTransitions } from '@automatarium/simulation/src/utils'
import { simulateTM } from '@automatarium/simulation/src/simulateTM'
import { AtecProject } from '@automatarium/secure-file'
import { FSAProjectGraph, PDAProjectGraph, TMProjectGraph } from '/src/types/ProjectTypes'
import { Preferences } from '/src/stores/usePreferencesStore'

/** Prueba una cadena en una pestaña de la entrega. Devuelve si fue aceptada. */
export const acceptsString = (project: AtecProject, input: string): boolean => {
  const graph = {
    initialState: project.initialState,
    projectType: project.projectType,
    states: project.states,
    transitions: expandTransitions(project.transitions as never)
  }
  switch (project.projectType) {
    case 'PDA': return simulatePDA(graph as unknown as PDAProjectGraph, input).accepted
    case 'TM': return simulateTM(graph as unknown as TMProjectGraph, input, { pauseTM: false } as Preferences).accepted
    default: return simulateFSA(graph as unknown as FSAProjectGraph, input).accepted
  }
}
