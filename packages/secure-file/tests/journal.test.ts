import {
  JournalEntry, JournalGraph, applyDiff, diffGraph, emptyGraph, journalMetrics, replayJournal, sameGraph,
  sealJournal, verifyJournalChain
} from '../src'

const g = (states: number[], transitions: [number, number, number][] = [], initialState: number | null = null): JournalGraph => ({
  states: states.map(id => ({ id, x: id * 10, y: 0, isFinal: false } as never)),
  transitions: transitions.map(([id, from, to]) => ({ id, from, to, read: 'a' } as never)),
  comments: [],
  initialState
})

test('diff + apply reconstruye el grafo', () => {
  const a = g([0, 1], [[0, 0, 1]], 0)
  const b = { ...g([1, 2], [[1, 1, 2]], 1) }
  b.states[0] = { ...b.states[0], x: 999 } as never
  const d = diffGraph(a, b)!
  expect(d).not.toBeNull()
  expect(sameGraph(applyDiff(a, d), b)).toBe(true)
  expect(diffGraph(b, b)).toBeNull()
})

const entry = (t: number, tab: string, prev: JournalGraph, next: JournalGraph, k: JournalEntry['k'] = 'edit'): JournalEntry =>
  ({ t, dev: 'dev-1', tab, k, d: diffGraph(prev, next) ?? undefined })

const history = () => {
  const s1 = g([0]); const s2 = g([0, 1]); const s3 = g([0, 1], [[0, 0, 1]], 0)
  return {
    final: s3,
    entries: [
      { t: 1000, dev: 'dev-1', tab: 'A', k: 'create', n: 'FSA' },
      entry(2000, 'A', emptyGraph(), s1),
      entry(3000, 'A', s1, s2),
      entry(4000, 'A', s2, s3)
    ] as JournalEntry[]
  }
}

test('reproducir la bitácora da el autómata final', () => {
  const { entries, final } = history()
  expect(sameGraph(replayJournal(entries).get('A')!, final)).toBe(true)
})

test('la cadena detecta que se borró o cambió una entrada', async () => {
  const { entries } = history()
  const sealed = await sealJournal(entries)
  expect(await verifyJournalChain(sealed)).toBe(-1)

  const removed = { entries: entries.filter((_, i) => i !== 2), hashes: sealed.hashes.filter((_, i) => i !== 2) }
  expect(await verifyJournalChain(removed)).toBe(2)

  const changed = { ...sealed, entries: sealed.entries.map((e, i) => i === 1 ? { ...e, t: 1 } : e) }
  expect(await verifyJournalChain(changed)).toBe(1)
})

test('las métricas miden tiempo activo, sesiones y el paso más grande', () => {
  const { entries } = history()
  const big = g([0, 1, 2, 3, 4, 5, 6, 7])
  const later = entry(4000 + 60 * 60 * 1000, 'B', emptyGraph(), big)
  const m = journalMetrics([...entries, later])
  expect(m.activeMs).toBe(3000)
  expect(m.sessions).toBe(2)
  expect(m.largestStep).toBe(8)
  expect(m.nonMonotonic).toBe(false)
  expect(journalMetrics([entries[1], entries[0]]).nonMonotonic).toBe(true)
})
