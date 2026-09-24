import dayjs from 'dayjs'
import { Settings, HelpCircle, FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, Header, Main, ProjectCard, ImportDialog } from '/src/components'
import { PROJECT_THUMBNAIL_WIDTH } from '/src/config/rendering'
import { usePreferencesStore, useProjectStore, useThumbnailStore, useModulesStore, useStudentStore } from '/src/stores'
import { createNewProject } from '/src/stores/useProjectStore' // #HACK
import { dispatchCustomEvent } from '/src/util/events'
import { StoredModule } from 'src/stores/useModuleStore'
import { ButtonGroup, HeaderRow, NoResultSpan, PreferencesButton } from './newFileStyle'
import TourButton from '/src/components/TourButton/TourButton'
import { createEntrega, deleteEntrega, openEntrega } from '/src/tec/entregas'
import InstallButton from '/src/tec/InstallButton'

import { CardList, NewProjectCard } from './components'
import FSA from './images/FSA'
import PDA from './images/PDA'
import TM from './images/TM'
import { ProjectType } from '/src/types/ProjectTypes'
import NewPageTour from '../Tutorials/guidedTour/NewPageTour'
import { useTranslation } from 'react-i18next'
import useModuleStore from '/src/stores/useModuleStore'

/**
 * Pantalla principal de Automatarium Tec: nuevas entregas, ejemplos y "Mis entregas"
 */
const NewFile = () => {
  const { t } = useTranslation(['common', 'newfile', 'tec'])
  const navigate = useNavigate()
  const setProject = useProjectStore(s => s.set)
  const thumbnails = useThumbnailStore(s => s.thumbnails)
  const preferences = usePreferencesStore(state => state.preferences)
  const theme = usePreferencesStore(state => state.getTheme())
  const student = useStudentStore(s => s.student)
  const modules = useModulesStore(s => s.modules)
  const setModule = useModuleStore(s => s.setModule)
  const setShowModuleWindow = useModuleStore(s => s.setShowModuleWindow)

  // We find the tallest card using method shown here
  // https://legacy.reactjs.org/docs/hooks-faq.html#how-can-i-measure-a-dom-node
  const [height, setHeight] = useState(0)
  const cardsRef = useCallback((node: HTMLDivElement) => {
    if (node === null) return
    // Get the height of the tallest card, we will set the rest of the cards to it
    setHeight(Math.max(...[...node.children].map(it => it.getBoundingClientRect().height)))
  }, [])

  /// Tour stuff
  const [showTour, setShowTour] = useState(false)

  const handleStep = (step: number) => {
    if (step === 1) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (step === 2) {
      window.scrollTo({ top: 1010, behavior: 'smooth' })
    } else if (step === 3) {
      window.scrollTo({ top: 10, behavior: 'smooth' })
    }
  }

  // If matching system theme, don't append a theme to css vars
  const cssTheme = preferences.theme === 'system' ? '' : `-${preferences.theme}`
  const getThumbTheme = useCallback((id: string) => {
    const thumbTheme = theme === 'dark' ? '-dark' : ''
    return `${id}${thumbTheme}`
  }, [theme])
  const stylingVals = {
    stateFill: `var(--state-bg${cssTheme})`,
    strokeColor: `var(--stroke${cssTheme})`
  }

  // Al volver a esta pantalla no hay ninguna entrega abierta
  useEffect(() => {
    setModule(null)
    setShowModuleWindow(false)
  }, [])

  const handleNewEntrega = (type: ProjectType) => {
    createEntrega(type)
    navigate('/editor')
  }

  const handleOpenEntrega = (module: StoredModule) => {
    openEntrega(module)
    navigate('/editor')
  }

  const handleDeleteEntrega = (module: StoredModule) => {
    if (window.confirm(t('newfile.delete_confirm', { ns: 'tec', name: module.meta.name }))) {
      deleteEntrega(module._id)
    }
  }

  const handleNewExample = (type: ProjectType) => {
    setModule(null)
    setProject(createNewProject(type))
    navigate('/example')
  }

  const typesOf = (module: StoredModule) => [...new Set(module.projects.map(p => p.projectType))].join(' · ')

  return <Main wide>
    <HeaderRow>
      <Header linkTo="/" />
      <div style={{ flex: 1 }} />
      <ButtonGroup>
        <InstallButton />
        <PreferencesButton title={t('header.button.title', { ns: 'newfile' })} type="button" onClick={() => dispatchCustomEvent('modal:preferences', null)}><Settings /></PreferencesButton>
      </ButtonGroup>
    </HeaderRow>

    {student && <p style={{ marginTop: 0, opacity: 0.8 }}>{t('student.badge', { ns: 'tec', name: student.name, control: student.controlNumber })}</p>}

    <CardList
      title={t('newfile.new_title', { ns: 'tec' })}
      button={<Button icon={<FolderOpen />} onClick={() => dispatchCustomEvent('submission:open', null)}>{t('submission.open', { ns: 'tec' })}</Button>}
      innerRef={cardsRef}
    >
      <NewProjectCard
        title={t('fsa', { ns: 'common' })}
        description={t('newfile.new_desc_fsa', { ns: 'tec' })}
        onClick={() => handleNewEntrega('FSA')}
        height={height}
        image={<FSA {...stylingVals} />}
      />
      <NewProjectCard
        title={t('pda', { ns: 'common' })}
        description={t('newfile.new_desc_pda', { ns: 'tec' })}
        onClick={() => handleNewEntrega('PDA')}
        height={height}
        image={<PDA {...stylingVals} />}
      />
      <NewProjectCard
        title={t('tm', { ns: 'common' })}
        description={t('newfile.new_desc_tm', { ns: 'tec' })}
        onClick={() => handleNewEntrega('TM')}
        height={height}
        image={<TM {...stylingVals} />}
      />
    </CardList>

    <CardList
      title={t('newfile.mine', { ns: 'tec' })}
      style={{ gap: '1.5em .4em' }}
    >
      {[...modules].sort((a, b) => b.meta.dateEdited - a.meta.dateEdited).map(module =>
        <ProjectCard
          key={module._id}
          name={module.meta.name ?? '<Untitled>'}
          type={typesOf(module)}
          date={`${dayjs().to(dayjs(module.meta.dateEdited))} · ${t('newfile.tabs_count', { ns: 'tec', count: module.projects.length })}`}
          image={module.projects[0] && thumbnails[getThumbTheme(module.projects[0]._id)]}
          width={PROJECT_THUMBNAIL_WIDTH}
          onClick={() => handleOpenEntrega(module)}
          $istemplate={true}
          $deleteTemplate={event => {
            event.stopPropagation()
            handleDeleteEntrega(module)
          }}
        />
      )}
      {modules.length === 0 && <NoResultSpan>{t('newfile.nothing', { ns: 'tec' })}</NoResultSpan>}
    </CardList>

    <CardList
      title={t('examples.title', { ns: 'newfile' })}
      innerRef={cardsRef}
    >
      <NewProjectCard
        title={t('fsa', { ns: 'common' })}
        description={t('examples.fsa_desc', { ns: 'newfile' })}
        onClick={() => handleNewExample('FSA')}
        height={height}
        image={<FSA {...stylingVals} />}
      />
      <NewProjectCard
        title={t('pda', { ns: 'common' })}
        description={t('examples.pda_desc', { ns: 'newfile' })}
        onClick={() => handleNewExample('PDA')}
        height={height}
        image={<PDA {...stylingVals} />}
      />
      <NewProjectCard
        title={t('tm', { ns: 'common' })}
        description={t('examples.tm_desc', { ns: 'newfile' })}
        onClick={() => handleNewExample('TM')}
        height={height}
        image={<TM {...stylingVals} />}
      />
    </CardList>

    <TourButton
      icon={<HelpCircle />}
      onClick={() => setShowTour(true)}>
    </TourButton>

    {showTour && <NewPageTour onClose={() => setShowTour(false)} stepCallback={handleStep} />}
    <ImportDialog navigateFunction={navigate} />
  </Main>
}

export default NewFile
