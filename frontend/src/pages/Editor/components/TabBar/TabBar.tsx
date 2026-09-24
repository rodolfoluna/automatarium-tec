import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Plus, X } from 'lucide-react'

import COLORS, { ColourName } from '/src/config/colors'
import { DEFAULT_PROJECT_COLOR } from '/src/config/projects'
import { useEvent } from '/src/hooks'
import { useJournalStore, useModuleStore, useProjectStore } from '/src/stores'
import { ProjectType } from '/src/types/ProjectTypes'
import { addTab, closeTab, moveTab, renameTab, switchTab } from '/src/tec/entregas'
import { AddMenu, Bar, IconButton, RenameInput, Tab, Tabs, TypeChip } from './tabBarStyle'

const TYPES: ProjectType[] = ['FSA', 'PDA', 'TM']
const NONE: string[] = []

const colorOf = (name: string) => {
  const c = COLORS[name as ColourName] ?? COLORS.orange
  return `hsl(${c.h} ${c.s}% ${c.l}%)`
}

/** Pestañas de la entrega: un autómata por pestaña */
const TabBar = () => {
  const { t } = useTranslation(['tec', 'common'])
  const module = useModuleStore(s => s.module)
  const currentId = useProjectStore(s => s.project?._id)
  const currentName = useProjectStore(s => s.project?.meta.name)
  const imported = useJournalStore(s => (module && s.journals[module._id]?.importedExternal) || NONE)

  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)

  // Cerrar el menú de "agregar" al hacer clic fuera
  useEffect(() => {
    if (!addOpen) return
    const close = (e: MouseEvent) => { if (!addRef.current?.contains(e.target as Node)) setAddOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [addOpen])

  // Alt + RePág / AvPág para cambiar de pestaña
  useEvent('keydown', e => {
    if (!module || !e.altKey || (e.key !== 'PageDown' && e.key !== 'PageUp')) return
    const i = module.projects.findIndex(p => p._id === currentId)
    const next = module.projects[(i + (e.key === 'PageDown' ? 1 : -1) + module.projects.length) % module.projects.length]
    if (next) { e.preventDefault(); switchTab(next._id) }
  }, [module, currentId])

  if (!module) return null

  const startRename = (id: string, name: string) => {
    setRenaming(id)
    setRenameValue(name)
  }

  const finishRename = () => {
    if (renaming) renameTab(renaming, renameValue)
    setRenaming(null)
  }

  const handleClose = (id: string, name: string) => {
    if (module.projects.length <= 1) return window.alert(t('tabs.last_tab'))
    if (window.confirm(t('tabs.close_confirm', { name }))) closeTab(id)
  }

  return (
    <Bar>
      <Tabs role="tablist">
        {module.projects.map((p, i) => {
          const active = p._id === currentId
          const name = active ? (currentName ?? p.meta.name) : p.meta.name
          return (
            <Tab
              key={p._id}
              role="tab"
              aria-selected={active}
              $active={active}
              $dragOver={dragOver === i && dragIndex !== i}
              title={t('tabs.rename')}
              draggable={renaming !== p._id}
              onClick={() => switchTab(p._id)}
              onDoubleClick={() => startRename(p._id, name)}
              onDragStart={() => setDragIndex(i)}
              onDragOver={e => { e.preventDefault(); setDragOver(i) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => { if (dragIndex !== null) moveTab(dragIndex, i); setDragIndex(null); setDragOver(null) }}
              onDragEnd={() => { setDragIndex(null); setDragOver(null) }}
            >
              <TypeChip $color={colorOf(p.config.color)}>{p.projectType}</TypeChip>
              {renaming === p._id
                ? <RenameInput
                    autoFocus
                    value={renameValue}
                    maxLength={40}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={finishRename}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') finishRename()
                      if (e.key === 'Escape') setRenaming(null)
                      e.stopPropagation()
                    }}
                  />
                : <span className="name">{name}</span>}
              {imported.includes(p._id) && <AlertTriangle size="1em" aria-label={t('tabs.imported')}><title>{t('tabs.imported')}</title></AlertTriangle>}
              {module.projects.length > 1 && (
                <IconButton
                  title={t('tabs.close')}
                  aria-label={t('tabs.close')}
                  onClick={e => { e.stopPropagation(); handleClose(p._id, name) }}
                ><X /></IconButton>
              )}
            </Tab>
          )
        })}
      </Tabs>
      <div ref={addRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '0 .3em' }}>
        <IconButton title={t('tabs.add')} aria-label={t('tabs.add')} onClick={() => setAddOpen(!addOpen)}><Plus /></IconButton>
        {addOpen && (
          <AddMenu>
            {TYPES.map(type => (
              <button key={type} type="button" onClick={() => { addTab(type); setAddOpen(false) }}>
                <TypeChip $color={colorOf(DEFAULT_PROJECT_COLOR[type])}>{type}</TypeChip>
                {t(type.toLowerCase(), { ns: 'common' })}
              </button>
            ))}
          </AddMenu>
        )}
      </div>
    </Bar>
  )
}

export default TabBar
