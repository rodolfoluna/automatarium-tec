import {
  AtecModule, AtecProject, JournalEntry, SubmissionPayload, analyzeSubmission, crossCheck, deriveStudentKeys, diffGraph,
  emptyGraph, exportTeacherKeyFile, generateTeacherKeyPair, importTeacherKeyFile, importTeacherPublicKey, pickGraph,
  reportsToCSV, sealJournal, sealSubmission, structureHash
} from '../src'

const APP_SECRET = new Uint8Array(32).fill(3).buffer

const state = (id: number, x: number, isFinal = false) => ({ id, x, y: 100, isFinal })
const tr = (id: number, from: number, to: number, read: string) => ({ id, from, to, read })

/** Simula a un alumno dibujando paso a paso (un elemento cada 20 s) */
const drawStepByStep = (tabId: string, final: AtecProject, dev: string, start = 1_000_000): JournalEntry[] => {
  const entries: JournalEntry[] = [{ t: start, dev, tab: tabId, k: 'create', n: final.projectType }]
  let g = emptyGraph()
  let t = start
  const steps = [
    ...final.states.map(s => (x: typeof g) => ({ ...x, states: [...x.states, s], initialState: x.initialState ?? s.id })),
    ...final.transitions.map(tt => (x: typeof g) => ({ ...x, transitions: [...x.transitions, tt] }))
  ]
  for (const step of steps) {
    const next = step(g)
    t += 20_000
    entries.push({ t, dev, tab: tabId, k: 'edit', d: diffGraph(g, next) ?? undefined })
    g = next
  }
  return entries
}

const project = (id: string, xs = [0, 100, 200]): AtecProject => ({
  _id: id,
  projectType: 'FSA',
  meta: { name: 'AF 1' },
  states: xs.map((x, i) => state(i, x, i === xs.length - 1)),
  transitions: [tr(0, 0, 1, 'a'), tr(1, 1, 2, 'b')],
  comments: [],
  initialState: 0
})

const setup = async () => {
  const pair = await generateTeacherKeyPair()
  const keyFile = await exportTeacherKeyFile(pair, 'profesor-secreto', 1000)
  const teacherPub = await importTeacherPublicKey(keyFile.publicKey)
  const teacherKey = await importTeacherKeyFile(keyFile, 'profesor-secreto')

  const make = async (controlNumber: string, tab: AtecProject, entries: JournalEntry[], extra: Partial<SubmissionPayload<AtecModule>> = {}, dev = 'dev-' + controlNumber) => {
    const payload: SubmissionPayload<AtecModule> = {
      format: 'automatarium-tec-payload',
      v: 1,
      student: { controlNumber, name: 'Alumno ' + controlNumber, installId: dev },
      module: { _id: 'm-' + controlNumber, meta: { name: 'Práctica 1' }, projects: [tab] },
      journal: await sealJournal(entries),
      flags: { importedExternal: [], localStoreTampered: [] },
      appVersion: 'test',
      createdAt: 1,
      savedAt: 2,
      ...extra
    }
    const file = await sealSubmission(payload, await deriveStudentKeys(APP_SECRET, controlNumber), teacherPub)
    return JSON.stringify(file)
  }
  return { teacherKey, make }
}

test('una entrega hecha paso a paso queda como íntegra', async () => {
  const { teacherKey, make } = await setup()
  const tab = project('t1')
  const text = await make('C1', tab, drawStepByStep('t1', tab, 'dev-C1'))
  const r = await analyzeSubmission('a.atec', text, teacherKey)
  expect(r.verdict).toBe('ok')
  expect(r.tabs[0].replayOk).toBe(true)
  expect(r.metrics!.activeMs).toBe(5 * 20_000)
})

test('un archivo alterado se marca como alterado', async () => {
  const { teacherKey, make } = await setup()
  const tab = project('t1')
  const file = JSON.parse(await make('C1', tab, drawStepByStep('t1', tab, 'dev-C1')))
  file.name = 'Otro nombre'
  const r = await analyzeSubmission('a.atec', JSON.stringify(file), teacherKey)
  expect(r.verdict).toBe('altered')
  expect(r.findings.map(f => f.code)).toContain('decrypt')
})

test('si el autómata no coincide con la bitácora, se marca como alterado', async () => {
  const { teacherKey, make } = await setup()
  const tab = project('t1')
  const entries = drawStepByStep('t1', tab, 'dev-C1')
  const forged = { ...tab, states: [...tab.states, state(9, 999)] }
  const r = await analyzeSubmission('a.atec', await make('C1', forged, entries), teacherKey)
  expect(r.verdict).toBe('altered')
  expect(r.findings.map(f => f.code)).toContain('replay')
})

test('todo el autómata en un solo paso y en segundos es sospechoso', async () => {
  const { teacherKey, make } = await setup()
  const tab = project('t1', [0, 100, 200, 300, 400, 500, 600, 700])
  const entries: JournalEntry[] = [
    { t: 1, dev: 'd', tab: 't1', k: 'create' },
    { t: 2, dev: 'd', tab: 't1', k: 'edit', d: diffGraph(emptyGraph(), pickGraph(tab as never)) ?? undefined }
  ]
  const r = await analyzeSubmission('a.atec', await make('C1', tab, entries), teacherKey)
  expect(r.verdict).toBe('suspicious')
  expect(r.findings.map(f => f.code)).toEqual(expect.arrayContaining(['bulk', 'fast']))
})

test('importaciones y almacenamiento alterado son sospechosos', async () => {
  const { teacherKey, make } = await setup()
  const tab = project('t1')
  const text = await make('C1', tab, drawStepByStep('t1', tab, 'dev-C1'), {
    flags: { importedExternal: ['t1'], localStoreTampered: [123] }
  })
  const r = await analyzeSubmission('a.atec', text, teacherKey)
  expect(r.verdict).toBe('suspicious')
  expect(r.findings.map(f => f.code)).toEqual(expect.arrayContaining(['imported', 'local-tamper']))
})

test('la revisión cruzada detecta dibujos copiados y dispositivos compartidos', async () => {
  const { teacherKey, make } = await setup()
  const a = project('ta')
  const b = project('tb') // mismo dibujo que a
  const c = project('tc', [0, 150, 300]) // misma estructura, otro dibujo
  const d = project('td', [5, 55, 505])
  const reports = await Promise.all([
    analyzeSubmission('a', await make('C1', a, drawStepByStep('ta', a, 'dev-C1')), teacherKey),
    analyzeSubmission('b', await make('C2', b, drawStepByStep('tb', b, 'dev-C2')), teacherKey),
    analyzeSubmission('c', await make('C3', c, drawStepByStep('tc', c, 'dev-C3')), teacherKey),
    analyzeSubmission('d', await make('C4', d, drawStepByStep('td', d, 'dev-C3'), {}, 'dev-C3'), teacherKey)
  ])
  crossCheck(reports)
  const codes = (i: number) => reports[i].findings.map(f => f.code)
  expect(codes(0)).toContain('copy-layout')
  expect(codes(1)).toContain('copy-layout')
  expect(codes(2)).toContain('copy-structure')
  expect(codes(2)).toContain('shared-device')
  expect(codes(3)).toContain('shared-device')
  expect(reports[2].verdict).toBe('suspicious')

  const csv = reportsToCSV(reports)
  expect(csv.split('\n')).toHaveLength(5)
  expect(csv).toContain('Sospechoso')
})

test('la huella estructural ignora nombres y posiciones', () => {
  const a = project('a')
  const b = { ...project('b', [7, 8, 9]), states: project('b', [7, 8, 9]).states.map(s => ({ ...s, name: 'x' + s.id })) }
  expect(structureHash(a)).toBe(structureHash(b))
  expect(structureHash(a)).not.toBe(structureHash({ ...a, transitions: [tr(0, 0, 1, 'a'), tr(1, 1, 2, 'c')] }))
})
