import { AtecError, SubmissionPayload, openAsTeacher, parseAtec } from './file'
import { normalizeControlNumber } from './keys'
import {
  IDLE_GAP_MS, JournalEntry, JournalGraph, JournalMetrics, diffSize, journalMetrics, pickGraph, replayJournal,
  sameGraph, verifyJournalChain
} from './journal'

/**
 * Revisión de entregas del lado del profesor.
 */

export interface AtecState { id: number, x: number, y: number, isFinal: boolean, name?: string, label?: string }
export interface AtecTransition {
  id: number, from: number, to: number, read: string
  push?: string, pop?: string, write?: string, direction?: string
}
export interface AtecProject {
  _id: string
  projectType: 'FSA' | 'PDA' | 'TM'
  meta: { name: string }
  states: AtecState[]
  transitions: AtecTransition[]
  comments: { id: number, x: number, y: number, text: string }[]
  initialState: number | null
  config?: Record<string, unknown>
  tests?: { single: string, batch: string[] }
}
export interface AtecModule {
  _id: string
  meta: { name: string, dateCreated?: number, dateEdited?: number }
  projects: AtecProject[]
  questions?: Record<string, string>
  description?: string
}

export type FindingLevel = 'altered' | 'suspicious' | 'info'

export interface Finding {
  level: FindingLevel
  code: string
  message: string
  tab?: string
}

export interface TabReport {
  id: string
  name: string
  type: string
  states: number
  transitions: number
  finals: number
  replayOk: boolean
  imported: boolean
  metrics: JournalMetrics
  /** Huella estructural (ignora posiciones y nombres) para buscar copias */
  structureHash: string
  /** Huella de posiciones: si coincide con otro alumno, el dibujo es idéntico */
  layoutHash: string
}

export type Verdict = 'ok' | 'suspicious' | 'altered'

export interface SubmissionReport {
  fileName: string
  controlNumber: string
  name: string
  savedAt: number | null
  verdict: Verdict
  findings: Finding[]
  tabs: TabReport[]
  metrics: JournalMetrics | null
  payload: SubmissionPayload<AtecModule> | null
}

export interface AnalysisOptions {
  /** Elementos agregados en un solo paso a partir de los cuales se considera sospechoso */
  bulkStep: number
  /** Si una pestaña con al menos `minElements` elementos se hizo en menos de este tiempo */
  minActiveMs: number
  minElements: number
}

export const DEFAULT_ANALYSIS: AnalysisOptions = {
  bulkStep: 8,
  minActiveMs: 60 * 1000,
  minElements: 6
}

const fnv = (s: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const transitionLabel = (t: AtecTransition) =>
  [t.read, t.pop, t.push, t.write, t.direction].map(x => x ?? '').join('|')

/**
 * Huella estructural tipo Weisfeiler-Lehman: dos autómatas con la misma forma y las mismas
 * etiquetas en las transiciones producen la misma huella aunque cambien nombres o posiciones.
 */
export const structureHash = (p: Pick<AtecProject, 'states' | 'transitions' | 'initialState'>): string => {
  let labels = new Map(p.states.map(s => [s.id, `${s.isFinal ? 'F' : 'N'}${s.id === p.initialState ? 'I' : ''}`]))
  for (let round = 0; round < 3; round++) {
    const next = new Map<number, string>()
    for (const s of p.states) {
      const out = p.transitions.filter(t => t.from === s.id).map(t => `>${transitionLabel(t)}:${labels.get(t.to)}`)
      const inc = p.transitions.filter(t => t.to === s.id).map(t => `<${transitionLabel(t)}:${labels.get(t.from)}`)
      next.set(s.id, fnv(labels.get(s.id) + [...out, ...inc].sort().join(',')))
    }
    labels = next
  }
  return fnv([...labels.values()].sort().join(',') + `#${p.states.length}/${p.transitions.length}`)
}

export const layoutHash = (p: Pick<AtecProject, 'states'>): string =>
  fnv(p.states.map(s => `${Math.round(s.x)},${Math.round(s.y)}`).sort().join(';'))

const emptyMetrics = (): JournalMetrics => journalMetrics([])

const finalize = (r: SubmissionReport): SubmissionReport => {
  r.verdict = r.findings.some(f => f.level === 'altered')
    ? 'altered'
    : r.findings.some(f => f.level === 'suspicious') ? 'suspicious' : 'ok'
  return r
}

const minutes = (ms: number) => Math.round(ms / 60000)

/** Descifra y revisa una entrega */
export const analyzeSubmission = async (
  fileName: string,
  text: string,
  teacherKey: CryptoKey,
  options: AnalysisOptions = DEFAULT_ANALYSIS
): Promise<SubmissionReport> => {
  const report: SubmissionReport = {
    fileName, controlNumber: '?', name: '?', savedAt: null, verdict: 'ok', findings: [], tabs: [], metrics: null, payload: null
  }
  const add = (level: FindingLevel, code: string, message: string, tab?: string) => report.findings.push({ level, code, message, tab })

  let payload: SubmissionPayload<AtecModule>
  try {
    const atec = parseAtec(text)
    report.controlNumber = atec.controlNumber
    report.name = atec.name
    report.savedAt = atec.savedAt
    payload = await openAsTeacher<AtecModule>(atec, teacherKey)
  } catch (e) {
    if (e instanceof AtecError && e.code === 'not-atec') add('altered', 'not-atec', 'No es una entrega de Automatarium Tec')
    else add('altered', 'decrypt', 'No se pudo descifrar: el archivo fue modificado fuera de la app (o es de otro grupo)')
    return finalize(report)
  }
  report.payload = payload

  if (normalizeControlNumber(payload.student.controlNumber) !== normalizeControlNumber(report.controlNumber) ||
      payload.student.name !== report.name) {
    add('altered', 'identity', 'Los datos del alumno del encabezado no coinciden con el contenido')
  }

  const brokenAt = await verifyJournalChain(payload.journal)
  if (brokenAt !== -1) add('altered', 'chain', `La bitácora está rota a partir de la entrada ${brokenAt + 1}`)

  const entries: JournalEntry[] = payload.journal.entries
  report.metrics = journalMetrics(entries)
  if (report.metrics.nonMonotonic) add('suspicious', 'clock', 'Las fechas de la bitácora retroceden (reloj alterado o bitácora manipulada)')

  const replayed = replayJournal(entries)
  const imported = new Set(payload.flags.importedExternal)

  for (const tab of payload.module.projects ?? []) {
    const tabEntries = entries.filter(e => e.tab === tab._id)
    const metrics = tabEntries.length ? journalMetrics(tabEntries) : emptyMetrics()
    const graph = replayed.get(tab._id)
    const replayOk = !!graph && sameGraph(graph, pickGraph(tab as unknown as JournalGraph))
    const elements = tab.states.length + tab.transitions.length
    const tr: TabReport = {
      id: tab._id,
      name: tab.meta?.name ?? '?',
      type: tab.projectType,
      states: tab.states.length,
      transitions: tab.transitions.length,
      finals: tab.states.filter(s => s.isFinal).length,
      replayOk,
      imported: imported.has(tab._id),
      metrics,
      structureHash: structureHash(tab),
      layoutHash: layoutHash(tab)
    }
    report.tabs.push(tr)

    if (!replayOk) add('altered', 'replay', 'El autómata entregado no coincide con la bitácora de edición', tr.name)
    if (tr.imported) add('suspicious', 'imported', 'Contiene contenido importado desde fuera de la app (JSON, JFLAP o URL)', tr.name)
    const bulk = Math.max(0, ...tabEntries.filter(e => e.k !== 'import').map(e => diffSize(e.d)))
    if (bulk >= options.bulkStep) add('suspicious', 'bulk', `Se agregaron ${bulk} elementos en un solo paso (¿pegado o plantilla?)`, tr.name)
    const syncs = tabEntries.filter(e => e.k === 'sync' && diffSize(e.d) > 2)
    if (syncs.length) add('suspicious', 'sync', 'Hubo cambios que no pasaron por el editor', tr.name)
    if (elements >= options.minElements && metrics.activeMs < options.minActiveMs) {
      add('suspicious', 'fast', `Tiene ${elements} elementos pero solo ~${Math.max(1, Math.round(metrics.activeMs / 1000))} s de trabajo registrado`, tr.name)
    }
  }

  if (payload.flags.localStoreTampered.length) {
    add('suspicious', 'local-tamper', `El almacenamiento local de la app fue alterado ${payload.flags.localStoreTampered.length} vez/veces`)
  }
  if (report.metrics.devices.length > 1) {
    add('info', 'devices', `Trabajó en ${report.metrics.devices.length} dispositivos`)
  }
  add('info', 'time', `Tiempo activo aprox. ${minutes(report.metrics.activeMs)} min en ${report.metrics.sessions} sesión(es); pausas > ${minutes(IDLE_GAP_MS)} min no cuentan`)

  return finalize(report)
}

/**
 * Comparaciones entre entregas de distintos alumnos: mismo dispositivo, dibujo idéntico
 * o estructura idéntica.
 */
export const crossCheck = (reports: SubmissionReport[], minStatesForSimilarity = 3): SubmissionReport[] => {
  const byStudent = (r: SubmissionReport) => normalizeControlNumber(r.controlNumber)
  const devices = new Map<string, Set<string>>()
  const layouts = new Map<string, { student: string, tab: string, name: string }[]>()
  const structures = new Map<string, { student: string, tab: string, name: string }[]>()

  for (const r of reports) {
    if (!r.payload) continue
    const student = byStudent(r)
    for (const d of [r.payload.student.installId, ...(r.metrics?.devices ?? [])]) {
      if (!devices.has(d)) devices.set(d, new Set())
      devices.get(d)!.add(student)
    }
    for (const t of r.tabs) {
      if (t.states < minStatesForSimilarity) continue
      const item = { student, tab: t.name, name: r.name }
      layouts.set(t.layoutHash + t.type, [...(layouts.get(t.layoutHash + t.type) ?? []), item])
      structures.set(t.structureHash + t.type, [...(structures.get(t.structureHash + t.type) ?? []), item])
    }
  }

  for (const r of reports) {
    if (!r.payload) continue
    const student = byStudent(r)
    // Quitar hallazgos cruzados de una revisión anterior
    r.findings = r.findings.filter(f => !['shared-device', 'copy-layout', 'copy-structure'].includes(f.code))

    const others = new Set<string>()
    for (const d of [r.payload.student.installId, ...(r.metrics?.devices ?? [])]) {
      devices.get(d)?.forEach(s => s !== student && others.add(s))
    }
    if (others.size) {
      r.findings.push({ level: 'suspicious', code: 'shared-device', message: `Usó el mismo dispositivo que: ${[...others].join(', ')}` })
    }

    for (const t of r.tabs) {
      const sameLayout = (layouts.get(t.layoutHash + t.type) ?? []).filter(x => x.student !== student)
      const sameStructure = (structures.get(t.structureHash + t.type) ?? []).filter(x => x.student !== student)
      if (sameLayout.length) {
        r.findings.push({ level: 'suspicious', code: 'copy-layout', tab: t.name, message: `Dibujo idéntico (mismas posiciones) al de: ${sameLayout.map(x => `${x.student} (${x.tab})`).join(', ')}` })
      } else if (sameStructure.length) {
        r.findings.push({ level: 'info', code: 'copy-structure', tab: t.name, message: `Misma estructura que: ${sameStructure.map(x => `${x.student} (${x.tab})`).join(', ')}` })
      }
    }
    finalize(r)
  }
  return reports
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Reporte en CSV (una fila por entrega) */
export const reportsToCSV = (reports: SubmissionReport[]): string => {
  const header = ['archivo', 'numero_control', 'nombre', 'estado', 'guardado', 'pestanas', 'tipos', 'minutos_activos', 'sesiones', 'dispositivos', 'hallazgos']
  const verdict = { ok: 'Íntegro', suspicious: 'Sospechoso', altered: 'Alterado' }
  const rows = reports.map(r => [
    r.fileName,
    r.controlNumber,
    r.name,
    verdict[r.verdict],
    r.savedAt ? new Date(r.savedAt).toISOString() : '',
    r.tabs.length,
    r.tabs.map(t => t.type).join(' '),
    r.metrics ? minutes(r.metrics.activeMs) : '',
    r.metrics?.sessions ?? '',
    r.metrics?.devices.length ?? '',
    r.findings.filter(f => f.level !== 'info').map(f => (f.tab ? `[${f.tab}] ` : '') + f.message).join(' / ')
  ])
  return '﻿' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
}
