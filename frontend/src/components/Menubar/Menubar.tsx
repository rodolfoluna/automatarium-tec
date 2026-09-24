import { useState, useEffect, useRef, HTMLAttributes } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

import { Button, Logo, Dropdown } from '/src/components'
import { useEvent } from '/src/hooks'
import { useProjectStore, useModuleStore, useStudentStore } from '/src/stores'
import { saveCurrentTab, saveModule } from '/src/tec/entregas'
import { canShareFiles } from '/src/tec/submission'
import { Save, Share2 } from 'lucide-react'

import {
  Wrapper,
  Menu,
  Name,
  NameRow,
  SaveStatus,
  DropdownMenus,
  Actions,
  DropdownButtonWrapper,
  NameInput,
  StudentBadge
} from './menubarStyle'

import menus from './menus'
import { dispatchCustomEvent } from '/src/util/events'
import { ContextItem } from '/src/components/ContextMenus/contextItem'
import { useTranslation } from 'react-i18next'

// Extend dayjs
dayjs.extend(relativeTime)

interface DropdownButton extends HTMLAttributes<HTMLButtonElement> {
  item: ContextItem
  dropdown: string
  setDropdown: (x: undefined) => void
}

const DropdownButton = ({ item, dropdown, setDropdown, ...props }: DropdownButton) => {
  const buttonRef = useRef<HTMLButtonElement>()
  const [rect, setRect] = useState<DOMRect>()

  useEffect(() => {
    if (buttonRef.current) setRect(buttonRef.current.getBoundingClientRect())
  }, [buttonRef.current])
  return (
    <>
      <DropdownButtonWrapper
        type="button"
        ref={buttonRef}
        $active={dropdown === item.label}
        {...props}
      >{item.label}</DropdownButtonWrapper>

      <Dropdown
        style={{
          top: `${rect?.y + rect?.height + 10}px`,
          left: `${rect?.x}px`
        }}
        items={item.items}
        visible={dropdown === item.label}
        onClose={() => setDropdown(undefined)}
      />
    </>
  )
}

const Menubar = ({ isSaving }: { isSaving: boolean }) => {
  const navigate = useNavigate()
  const [dropdown, setDropdown] = useState<string>()

  const titleRef = useRef<HTMLInputElement>()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')

  // Automatarium Tec: el título es el nombre de la entrega; cada pestaña tiene su propio nombre
  const entregaName = useModuleStore(s => s.module?.meta?.name)
  const setEntregaName = useModuleStore(s => s.setName)
  const lastChangeDate = useProjectStore(s => s.lastChangeDate)
  const lastSaveDate = useProjectStore(s => s.lastSaveDate)
  const setLastSaveDate = useProjectStore(s => s.setLastSaveDate)
  const student = useStudentStore(s => s.student)
  const { t } = useTranslation(['common', 'tec'])

  const handleEditProjectName = () => {
    setTitleValue(entregaName ?? '')
    setEditingTitle(true)
    window.setTimeout(() => titleRef.current?.select(), 50)
  }

  const handleSaveProjectName = () => {
    if (titleValue && !/^\s*$/.test(titleValue)) {
      setEntregaName(titleValue.trim())
      saveModule()
    }
    setEditingTitle(false)
  }

  useEvent('beforeunload', e => {
    if (lastSaveDate > lastChangeDate) return
    e.preventDefault()
    return t('menubar.not_saved')
  }, [lastSaveDate, lastChangeDate], { options: { capture: true }, target: window })

  return (
    <>
      <Wrapper>
        <Menu>
          <a href="/new" onClick={e => {
            e.preventDefault()
            saveCurrentTab()
            setLastSaveDate(new Date().getTime())
            navigate('/new')
          }}>
            <Logo />
          </a>

          <div>
            <NameRow>
              {editingTitle
                ? (
                <NameInput
                  value={titleValue}
                  onChange={e => setTitleValue(e.target.value)}
                  onBlur={handleSaveProjectName}
                  onKeyDown={e => e.code === 'Enter' && handleSaveProjectName()}
                  ref={titleRef}
                  maxLength={60}
                />
                  )
                : (
                <Name onClick={handleEditProjectName} title={t('menubar.edit_title')}>{entregaName ?? t('menubar.untitled')}</Name>
                  )}
              <SaveStatus $show={isSaving}>{t('menubar.saving')}</SaveStatus>
            </NameRow>

            <DropdownMenus>
              {menus(t).map((item: ContextItem) => (
                <DropdownButton
                  key={item.label}
                  item={item}
                  dropdown={dropdown}
                  setDropdown={setDropdown}
                  onClick={e => { setDropdown(dropdown === item.label ? undefined : item.label); e.stopPropagation() }}
                  onMouseEnter={() => dropdown !== undefined && setDropdown(item.label)}
                />
              ))}
            </DropdownMenus>
          </div>
        </Menu>

        <Actions>
          {student && <StudentBadge title={student.installId}>{t('student.badge', { ns: 'tec', name: student.name, control: student.controlNumber })}</StudentBadge>}
          {canShareFiles() && <Button secondary icon={<Share2 />} title={t('submission.share', { ns: 'tec' })} onClick={() => dispatchCustomEvent('submission:share', null)} />}
          <Button icon={<Save />} title={t('submission.save', { ns: 'tec' })} onClick={() => dispatchCustomEvent('submission:save', null)}>
            <span className="label-wide">{t('submission.save', { ns: 'tec' })}</span>
          </Button>
        </Actions>
      </Wrapper>
    </>
  )
}

export default Menubar
