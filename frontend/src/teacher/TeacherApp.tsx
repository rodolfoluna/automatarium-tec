import { ChangeEvent, DragEvent, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  AtecProject, DEFAULT_ANALYSIS, SubmissionReport, TeacherKeyFile, Verdict, analyzeSubmission, crossCheck,
  importTeacherKeyFile, reportsToCSV
} from '@automatarium/secure-file'
import GraphPreview from './GraphPreview'
import { acceptsString } from './simulate'
import {
  Badge, Card, Detail, DropArea, Finding, Header, Layout, Row, SmallButton, Table, TabTitle, TextInput
} from './teacherStyle'

const VERDICT: Record<Verdict, { label: string, color: string }> = {
  ok: { label: 'Íntegro', color: '#2e8b57' },
  suspicious: { label: 'Sospechoso', color: '#c98a00' },
  altered: { label: 'Alterado', color: '#c0392b' }
}

const LEVEL_ICON = { altered: '❌', suspicious: '⚠️', info: 'ℹ️' }

const download = (name: string, content: string, type = 'application/json') => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

/** Proyecto estándar de Automatarium para abrirlo en cualquier instalación */
const toAutomatariumJSON = (p: AtecProject) => JSON.stringify({
  ...p,
  simResult: [],
  tests: p.tests ?? { single: '', batch: [''] },
  meta: { ...p.meta, dateCreated: Date.now(), dateEdited: Date.now(), version: '1.0.0', automatariumVersion: '1.0.0' },
  config: p.config ?? { type: p.projectType, statePrefix: 'q', orOperator: '|', acceptanceCriteria: 'both', color: 'orange' }
}, null, 2)

/* ---------------------------------------------------------------------------
 * Llave del profesor
 * ------------------------------------------------------------------------- */

const KeyLoader = ({ onKey }: { onKey: (key: CryptoKey, file: TeacherKeyFile) => void }) => {
  const [keyFile, setKeyFile] = useState<TeacherKeyFile | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadFile = async (e: ChangeEvent<HTMLInputElement>) => {
    setError('')
    try {
      const parsed = JSON.parse(await e.target.files![0].text())
      if (parsed?.format !== 'automatarium-tec-teacher-key') throw new Error()
      setKeyFile(parsed)
    } catch {
      setError('Ese archivo no es una llave de profesor (teacher-key.json).')
    }
  }

  const unlock = async () => {
    if (!keyFile) return
    setBusy(true)
    setError('')
    try {
      onKey(await importTeacherKeyFile(keyFile, password), keyFile)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ maxWidth: 520, margin: '8vh auto' }}>
      <h2>Llave del profesor</h2>
      <p>Carga tu archivo <code>teacher-key.json</code> y escribe su contraseña. La llave solo se usa en esta pestaña del navegador; no se envía a ningún lado.</p>
      <input type="file" accept=".json,application/json" onChange={loadFile} />
      {keyFile && <>
        <p style={{ margin: 0, opacity: 0.8 }}>Llave creada el {dayjs(keyFile.createdAt).format('DD/MM/YYYY')}</p>
        <TextInput
          type="password"
          placeholder="Contraseña"
          value={password}
          autoFocus
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && unlock()}
        />
        <SmallButton onClick={unlock} disabled={busy || !password}>{busy ? 'Abriendo…' : 'Abrir'}</SmallButton>
      </>}
      {error && <p style={{ color: 'var(--error)' }}>{error}</p>}
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Detalle de una entrega
 * ------------------------------------------------------------------------- */

const TabDetail = ({ project, report }: { project: AtecProject, report: SubmissionReport }) => {
  const [input, setInput] = useState('')
  const tabReport = report.tabs.find(t => t.id === project._id)
  const result = useMemo(() => {
    try {
      return input.split('\n').filter((s, i, all) => s !== '' || all.length === 1).map(s => ({ s, ok: acceptsString(project, s) }))
    } catch (e) {
      return [{ s: input, ok: false, error: (e as Error).message }]
    }
  }, [input, project])

  return (
    <Card>
      <TabTitle>
        <strong>{project.meta.name}</strong>
        <Badge $color="#555">{project.projectType}</Badge>
        {tabReport && <span style={{ opacity: 0.8 }}>
          {tabReport.states} estados · {tabReport.transitions} transiciones · {tabReport.metrics.edits} ediciones · ~{Math.round(tabReport.metrics.activeMs / 60000)} min
        </span>}
        <div style={{ flex: 1 }} />
        <SmallButton onClick={() => download(`${report.controlNumber}_${project.meta.name}.json`, toAutomatariumJSON(project))}>
          Descargar .json
        </SmallButton>
      </TabTitle>
      {report.payload?.module.questions?.[project._id] && <p><em>{report.payload.module.questions[project._id]}</em></p>}
      <GraphPreview project={project} />
      <details>
        <summary>Probar cadenas (una por línea; vacío = λ)</summary>
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={4} style={{ width: '100%', fontFamily: 'var(--font-mono)' }} />
        <div style={{ fontFamily: 'var(--font-mono)' }}>
          {result.map((r, i) => <div key={i}>{r.ok ? '✅' : '❌'} {r.s === '' ? 'λ' : r.s}</div>)}
        </div>
      </details>
    </Card>
  )
}

const SubmissionDetail = ({ report, onClose }: { report: SubmissionReport, onClose: () => void }) => (
  <Detail>
    <Row>
      <h2 style={{ margin: 0 }}>{report.name} · {report.controlNumber}</h2>
      <Badge $color={VERDICT[report.verdict].color}>{VERDICT[report.verdict].label}</Badge>
      <div style={{ flex: 1 }} />
      <SmallButton onClick={onClose}>Cerrar</SmallButton>
    </Row>
    <p style={{ opacity: 0.8 }}>
      Archivo <code>{report.fileName}</code>
      {report.savedAt ? ` · guardado ${dayjs(report.savedAt).format('DD/MM/YYYY HH:mm')}` : ''}
      {report.metrics?.firstEdit ? ` · primera edición ${dayjs(report.metrics.firstEdit).format('DD/MM/YYYY HH:mm')}` : ''}
    </p>
    <Card>
      <h3 style={{ marginTop: 0 }}>Hallazgos</h3>
      {report.findings.map((f, i) => (
        <Finding key={i} $level={f.level}>{LEVEL_ICON[f.level]} {f.tab ? <strong>[{f.tab}] </strong> : null}{f.message}</Finding>
      ))}
    </Card>
    {report.payload?.module.projects.map(p => <TabDetail key={p._id} project={p} report={report} />)}
  </Detail>
)

/* ---------------------------------------------------------------------------
 * Aplicación
 * ------------------------------------------------------------------------- */

const TeacherApp = () => {
  const [teacherKey, setTeacherKey] = useState<CryptoKey | null>(null)
  const [reports, setReports] = useState<SubmissionReport[]>([])
  const [selected, setSelected] = useState<SubmissionReport | null>(null)
  const [filter, setFilter] = useState<Verdict | 'all'>('all')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const addFiles = async (files: File[]) => {
    if (!teacherKey || !files.length) return
    setBusy(true)
    const fresh = await Promise.all(files.map(async f => analyzeSubmission(f.name, await f.text(), teacherKey, DEFAULT_ANALYSIS)))
    setReports(prev => {
      // Si se vuelve a cargar el mismo archivo, reemplaza la revisión anterior
      const names = new Set(fresh.map(r => r.fileName))
      return crossCheck([...prev.filter(r => !names.has(r.fileName)), ...fresh])
        .sort((a, b) => a.controlNumber.localeCompare(b.controlNumber))
    })
    setBusy(false)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles([...e.dataTransfer.files])
  }

  if (!teacherKey) return <Layout><KeyLoader onKey={key => setTeacherKey(key)} /></Layout>

  const visible = reports.filter(r => filter === 'all' || r.verdict === filter)
  const count = (v: Verdict) => reports.filter(r => r.verdict === v).length

  return (
    <Layout>
      <Header>
        <h1>Revisión de entregas</h1>
        <div style={{ flex: 1 }} />
        {reports.length > 0 && <>
          <SmallButton onClick={() => download(`revision_${dayjs().format('YYYY-MM-DD_HHmm')}.csv`, reportsToCSV(reports), 'text/csv')}>Exportar CSV</SmallButton>
          <SmallButton onClick={() => { setReports([]); setSelected(null) }}>Limpiar</SmallButton>
        </>}
      </Header>

      <DropArea
        $active={dragging}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>Arrastra aquí los archivos <code>.atec</code> de tus alumnos (puedes soltar muchos a la vez)</p>
        <input type="file" multiple accept=".atec,application/json" onChange={e => addFiles([...(e.target.files ?? [])])} />
        {busy && <p>Revisando…</p>}
      </DropArea>

      {reports.length > 0 && <>
        <Row style={{ margin: '1em 0' }}>
          {(['all', 'ok', 'suspicious', 'altered'] as const).map(v => (
            <SmallButton key={v} $active={filter === v} onClick={() => setFilter(v)}>
              {v === 'all' ? `Todas (${reports.length})` : `${VERDICT[v].label} (${count(v)})`}
            </SmallButton>
          ))}
        </Row>
        <Table>
          <thead>
            <tr>
              <th>Estado</th><th>No. control</th><th>Nombre</th><th>Pestañas</th><th>Tiempo activo</th><th>Guardado</th><th>Hallazgos</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.fileName} onClick={() => setSelected(r)} aria-selected={selected?.fileName === r.fileName}>
                <td><Badge $color={VERDICT[r.verdict].color}>{VERDICT[r.verdict].label}</Badge></td>
                <td>{r.controlNumber}</td>
                <td>{r.name}</td>
                <td>{r.tabs.map(t => t.type).join(' · ') || '—'}</td>
                <td>{r.metrics ? `${Math.round(r.metrics.activeMs / 60000)} min` : '—'}</td>
                <td>{r.savedAt ? dayjs(r.savedAt).format('DD/MM HH:mm') : '—'}</td>
                <td>{r.findings.filter(f => f.level !== 'info').map(f => f.message).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </>}

      {selected && <SubmissionDetail report={reports.find(r => r.fileName === selected.fileName) ?? selected} onClose={() => setSelected(null)} />}
    </Layout>
  )
}

export default TeacherApp
