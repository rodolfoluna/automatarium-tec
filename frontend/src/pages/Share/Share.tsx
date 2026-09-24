import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import { Spinner } from '/src/components'
import { importExternalModule, importExternalProject } from '/src/tec/submission'
import { Container } from './shareStyle'

import { useParseFile, useParseModuleFile } from '/src/hooks/useActions'
import { showWarning } from '/src/components/Warning/Warning'
import { decodeData } from '/src/util/encoding'
import { StoredModule } from '/src/stores/useModuleStore'
import { useTranslation } from 'react-i18next'
import { Project } from '/src/types/ProjectTypes'

const Share = () => {
  const { t } = useTranslation('share')
  const { type, data } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    switch (type) {
      case 'raw': {
        decodeData(data).then((decodedJson) => {
          const dataJson = new File([JSON.stringify(decodedJson)], 'Shared Project')
          useParseFile(onData, t('load_fail'), dataJson, handleLoadSuccess, handleLoadFail)
        })
        break
      }
      case 'module': {
        decodeData(data).then((decodedJson) => {
          const dataJson = new File([JSON.stringify(decodedJson)], 'Shared Project')
          useParseModuleFile(onModule, t('load_fail'), dataJson, handleLoadSuccess, handleLoadFail)
        })
        break
      }
      default: {
        showWarning(t('unknown_type') + ` ${type}`)
        handleLoadFail()
        break
      }
    }
  }, [data])

  // Automatarium Tec: lo compartido por URL entra como contenido importado
  const onData = (project: Project) => importExternalProject(project, { newEntrega: true })

  const onModule = (module: StoredModule) => importExternalModule(module)

  const handleLoadSuccess = () => {
    navigate('/editor')
  }

  const handleLoadFail = () => {
    navigate('/new')
  }

  return (
    <Container>
      <Spinner />
    </Container>
  )
}

export default Share
