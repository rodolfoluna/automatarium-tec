import { canonicalJSON, sha256Hex } from './encoding'

/**
 * Bitácora de integridad.
 *
 * Cada cambio que el alumno hace a un autómata se guarda como una diferencia pequeña
 * contra la versión anterior. Al entregar se encadenan con SHA-256. La herramienta
 * del profesor aplica todas las diferencias desde cero y comprueba que el resultado
 * sea igual al autómata entregado, y además analiza el ritmo de trabajo.
 */

type WithId = { id: number }

/** La parte del proyecto que se registra en la bitácora */
export interface JournalGraph {
  states: WithId[]
  transitions: WithId[]
  comments: WithId[]
  initialState: number | null
}

type Collection = 'states' | 'transitions' | 'comments'
const COLLECTIONS: Collection[] = ['states', 'transitions', 'comments']

interface CollectionDiff { add?: WithId[], del?: number[], upd?: WithId[] }
export type GraphDiff = Partial<Record<Collection, CollectionDiff>> & { init?: number | null }

export type JournalKind =
  | 'create' // se creó la pestaña
  | 'edit' // cambio normal hecho en el editor
  | 'import' // contenido que llegó desde fuera (JSON/JFLAP/URL/plantilla ajena)
  | 'sync' // diferencia detectada al guardar que no pasó por el editor
  | 'rename' // cambio de nombre de la pestaña
  | 'delete' // se cerró la pestaña

export interface JournalEntry {
  /** Fecha (ms) */
  t: number
  /** installId del dispositivo */
  dev: string
  /** _id de la pestaña (proyecto) */
  tab: string
  k: JournalKind
  d?: GraphDiff
  /** Nombre (en create/rename) o tipo de autómata */
  n?: string
}

export const emptyGraph = (): JournalGraph => ({ states: [], transitions: [], comments: [], initialState: null })

export const pickGraph = (p: JournalGraph): JournalGraph => ({
  states: p.states ?? [],
  transitions: p.transitions ?? [],
  comments: p.comments ?? [],
  initialState: p.initialState ?? null
})

/** Calcula la diferencia entre dos versiones. Devuelve null si son iguales. */
export const diffGraph = (prev: JournalGraph, next: JournalGraph): GraphDiff | null => {
  const diff: GraphDiff = {}
  let changed = false
  for (const c of COLLECTIONS) {
    const before = new Map((prev[c] ?? []).map(x => [x.id, x]))
    const after = new Map((next[c] ?? []).map(x => [x.id, x]))
    const add: WithId[] = []
    const upd: WithId[] = []
    const del: number[] = []
    for (const [id, item] of after) {
      const old = before.get(id)
      if (!old) add.push(item)
      else if (canonicalJSON(old) !== canonicalJSON(item)) upd.push(item)
    }
    for (const id of before.keys()) if (!after.has(id)) del.push(id)
    if (add.length || upd.length || del.length) {
      changed = true
      diff[c] = {
        ...(add.length ? { add } : {}),
        ...(upd.length ? { upd } : {}),
        ...(del.length ? { del } : {})
      }
    }
  }
  if ((prev.initialState ?? null) !== (next.initialState ?? null)) {
    diff.init = next.initialState ?? null
    changed = true
  }
  return changed ? diff : null
}

/** Aplica una diferencia sin modificar el grafo original */
export const applyDiff = (graph: JournalGraph, diff: GraphDiff): JournalGraph => {
  const out = { ...graph }
  for (const c of COLLECTIONS) {
    const cd = diff[c]
    if (!cd) continue
    const del = new Set(cd.del ?? [])
    const upd = new Map((cd.upd ?? []).map(x => [x.id, x]))
    out[c] = [
      ...graph[c].filter(x => !del.has(x.id)).map(x => upd.get(x.id) ?? x),
      ...(cd.add ?? [])
    ]
  }
  if ('init' in diff) out.initialState = diff.init ?? null
  return out
}

/** Número de elementos (estados + transiciones + comentarios) que una diferencia agrega */
export const diffSize = (d?: GraphDiff): number =>
  d ? COLLECTIONS.reduce((n, c) => n + (d[c]?.add?.length ?? 0), 0) : 0

/** Reconstruye cada pestaña aplicando la bitácora desde cero */
export const replayJournal = (entries: JournalEntry[]): Map<string, JournalGraph> => {
  const graphs = new Map<string, JournalGraph>()
  for (const e of entries) {
    if (e.k === 'delete') { graphs.delete(e.tab); continue }
    const g = graphs.get(e.tab) ?? emptyGraph()
    graphs.set(e.tab, e.d ? applyDiff(g, e.d) : g)
  }
  return graphs
}

/** Compara dos grafos sin importar el orden de los elementos */
export const sameGraph = (a: JournalGraph, b: JournalGraph): boolean => {
  const norm = (g: JournalGraph) => canonicalJSON({
    initialState: g.initialState ?? null,
    ...Object.fromEntries(COLLECTIONS.map(c => [c, [...(g[c] ?? [])].sort((x, y) => x.id - y.id)]))
  })
  return norm(a) === norm(b)
}

/* ---------------------------------------------------------------------------
 * Cadena de hashes
 * ------------------------------------------------------------------------- */

export interface SealedJournal {
  entries: JournalEntry[]
  /** hashes[i] = SHA-256(hashes[i-1] + canonicalJSON(entries[i])) */
  hashes: string[]
}

const GENESIS = 'automatarium-tec-journal-v1'

export const sealJournal = async (entries: JournalEntry[]): Promise<SealedJournal> => {
  const hashes: string[] = []
  let prev = GENESIS
  for (const e of entries) {
    prev = await sha256Hex(prev + canonicalJSON(e))
    hashes.push(prev)
  }
  return { entries, hashes }
}

/** Devuelve el índice de la primera entrada rota, o -1 si la cadena está completa */
export const verifyJournalChain = async (journal: SealedJournal): Promise<number> => {
  if (journal.hashes.length !== journal.entries.length) return Math.min(journal.hashes.length, journal.entries.length)
  let prev = GENESIS
  for (let i = 0; i < journal.entries.length; i++) {
    prev = await sha256Hex(prev + canonicalJSON(journal.entries[i]))
    if (prev !== journal.hashes[i]) return i
  }
  return -1
}

/* ---------------------------------------------------------------------------
 * Métricas de trabajo
 * ------------------------------------------------------------------------- */

/** Pausas mayores a esto no cuentan como tiempo activo */
export const IDLE_GAP_MS = 5 * 60 * 1000

export interface JournalMetrics {
  entries: number
  edits: number
  firstEdit: number | null
  lastEdit: number | null
  /** Tiempo activo aproximado (ms) */
  activeMs: number
  sessions: number
  devices: string[]
  imports: number
  syncs: number
  /** Mayor número de elementos agregados en un solo paso */
  largestStep: number
  /** Hay fechas que retroceden en el tiempo */
  nonMonotonic: boolean
}

export const journalMetrics = (entries: JournalEntry[]): JournalMetrics => {
  let activeMs = 0
  let sessions = entries.length ? 1 : 0
  let nonMonotonic = false
  for (let i = 1; i < entries.length; i++) {
    const gap = entries[i].t - entries[i - 1].t
    if (gap < 0) nonMonotonic = true
    else if (gap <= IDLE_GAP_MS) activeMs += gap
    else sessions++
  }
  return {
    entries: entries.length,
    edits: entries.filter(e => e.k === 'edit').length,
    firstEdit: entries[0]?.t ?? null,
    lastEdit: entries.at(-1)?.t ?? null,
    activeMs,
    sessions,
    devices: [...new Set(entries.map(e => e.dev))],
    imports: entries.filter(e => e.k === 'import').length,
    syncs: entries.filter(e => e.k === 'sync').length,
    largestStep: Math.max(0, ...entries.filter(e => e.k !== 'import').map(e => diffSize(e.d))),
    nonMonotonic
  }
}
