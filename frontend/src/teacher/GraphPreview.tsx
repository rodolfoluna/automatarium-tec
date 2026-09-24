import { AtecProject, AtecTransition } from '@automatarium/secure-file'

const R = 30

const labelOf = (type: string, t: AtecTransition) => {
  const read = t.read || 'λ'
  if (type === 'PDA') return `${read},${t.pop || 'λ'};${t.push || 'λ'}`
  if (type === 'TM') return `${read || 'λ'},${t.write || 'λ'};${t.direction ?? 'R'}`
  return read
}

/** Vista de solo lectura de un autómata (estados, transiciones y comentarios) */
const GraphPreview = ({ project, height = 320 }: { project: AtecProject, height?: number }) => {
  const { states, transitions, comments, initialState, projectType } = project
  if (!states.length) return <p style={{ opacity: 0.7 }}>Pestaña vacía.</p>

  const xs = [...states.map(s => s.x), ...comments.map(c => c.x)]
  const ys = [...states.map(s => s.y), ...comments.map(c => c.y)]
  const pad = 90
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const w = Math.max(...xs) - minX + pad
  const h = Math.max(...ys) - minY + pad
  const byId = new Map(states.map(s => [s.id, s]))

  // Agrupar transiciones con el mismo origen y destino en una sola flecha
  const groups = new Map<string, AtecTransition[]>()
  for (const t of transitions) {
    const key = `${t.from}-${t.to}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  return (
    <svg viewBox={`${minX} ${minY} ${w} ${h}`} style={{ width: '100%', height, background: 'var(--grid-bg)', borderRadius: '.4em' }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--stroke)" />
        </marker>
      </defs>
      {[...groups.values()].map(ts => {
        const from = byId.get(ts[0].from)
        const to = byId.get(ts[0].to)
        if (!from || !to) return null
        const text = ts.map(t => labelOf(projectType, t))
        if (from.id === to.id) {
          const d = `M ${from.x - 15} ${from.y - R + 4} C ${from.x - 45} ${from.y - R - 60}, ${from.x + 45} ${from.y - R - 60}, ${from.x + 15} ${from.y - R + 4}`
          return <g key={`${from.id}-${to.id}`}>
            <path d={d} fill="none" stroke="var(--stroke)" strokeWidth={2} markerEnd="url(#arrow)" />
            {text.map((l, i) => <text key={i} x={from.x} y={from.y - R - 52 - i * 16} textAnchor="middle" fontSize={14} fill="var(--stroke)">{l}</text>)}
          </g>
        }
        // Curva ligera si también existe la transición inversa
        const reverse = groups.has(`${to.id}-${from.id}`)
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const [ux, uy] = [dx / len, dy / len]
        const bend = reverse ? 30 : 0
        const [sx, sy] = [from.x + ux * R, from.y + uy * R]
        const [ex, ey] = [to.x - ux * R, to.y - uy * R]
        const [mx, my] = [(sx + ex) / 2 - uy * bend, (sy + ey) / 2 + ux * bend]
        return <g key={`${from.id}-${to.id}`}>
          <path d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`} fill="none" stroke="var(--stroke)" strokeWidth={2} markerEnd="url(#arrow)" />
          {text.map((l, i) => <text key={i} x={mx - uy * 12} y={my + ux * 12 - 6 - i * 16} textAnchor="middle" fontSize={14} fill="var(--stroke)">{l}</text>)}
        </g>
      })}
      {states.map(s => (
        <g key={s.id}>
          {s.id === initialState && <path d={`M ${s.x - R - 35} ${s.y} L ${s.x - R - 2} ${s.y}`} stroke="var(--stroke)" strokeWidth={2} markerEnd="url(#arrow)" />}
          <circle cx={s.x} cy={s.y} r={R} fill="var(--state-bg)" stroke="var(--stroke)" strokeWidth={2} />
          {s.isFinal && <circle cx={s.x} cy={s.y} r={R - 5} fill="none" stroke="var(--stroke)" strokeWidth={2} />}
          <text x={s.x} y={s.y + 5} textAnchor="middle" fontSize={15} fill="var(--stroke)">{s.name || `${(project.config?.statePrefix as string) ?? 'q'}${s.id}`}</text>
          {s.label && <text x={s.x} y={s.y + R + 18} textAnchor="middle" fontSize={12} fill="var(--stroke)" opacity={0.8}>{s.label}</text>}
        </g>
      ))}
      {comments.map(c => <text key={`c${c.id}`} x={c.x} y={c.y + 14} fontSize={13} fill="var(--comment-text)" opacity={0.85}>{c.text}</text>)}
    </svg>
  )
}

export default GraphPreview
