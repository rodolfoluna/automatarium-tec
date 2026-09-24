import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button } from '/src/components'

type InstallPromptEvent = Event & { prompt: () => Promise<void>, userChoice: Promise<{ outcome: string }> }

let deferredPrompt: InstallPromptEvent | null = null
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredPrompt = e as InstallPromptEvent
})

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Botón "Instalar app": usa el aviso del navegador o, en iOS, explica cómo instalarla */
const InstallButton = () => {
  const { t } = useTranslation('tec')
  const [canPrompt, setCanPrompt] = useState(!!deferredPrompt)

  useEffect(() => {
    const onPrompt = () => setCanPrompt(true)
    const onInstalled = () => setCanPrompt(false)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (isStandalone() || (!canPrompt && !isIOS())) return null

  const install = async () => {
    if (!deferredPrompt) return window.alert(t('install.ios'))
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    setCanPrompt(false)
  }

  return <Button secondary icon={<Download />} onClick={install}>{t('install.button')}</Button>
}

export default InstallButton
