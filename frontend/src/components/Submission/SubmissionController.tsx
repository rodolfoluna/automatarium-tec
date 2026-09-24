import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { styled } from 'goober'

import { useEvent } from '/src/hooks'
import { showWarning } from '/src/components/Warning/Warning'
import { AtecError, downloadSubmission, openSubmissionFile, shareSubmission } from '/src/tec/submission'
import { ATEC_EXTENSION } from '@automatarium/secure-file'

const Toast = styled('div')`
  position: fixed;
  bottom: 1.5em;
  left: 50%;
  transform: translateX(-50%);
  background: var(--toolbar);
  color: var(--white);
  padding: .7em 1.2em;
  border-radius: .5em;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .35);
  z-index: 1000;
`

/** Pide al alumno un archivo .atec */
export const promptSubmissionFile = (onFile: (file: File) => void) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = `${ATEC_EXTENSION},application/json`
  input.onchange = () => input.files?.[0] && onFile(input.files[0])
  input.click()
}

/**
 * Atiende los eventos submission:save / submission:share / submission:open desde cualquier pantalla
 */
const SubmissionController = () => {
  const { t } = useTranslation('tec')
  const navigate = useNavigate()
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timeout)
  }, [toast])

  const errorMessage = (e: unknown, fallback: string) => {
    if (e instanceof AtecError) {
      return {
        'wrong-student': t('submission.wrong_student'),
        tampered: t('submission.tampered'),
        'not-atec': t('submission.not_atec'),
        unsupported: e.message
      }[e.code]
    }
    return `${fallback}\n${(e as Error)?.message ?? e}`
  }

  useEvent('submission:save', async () => {
    try {
      if (await downloadSubmission()) setToast(t('submission.saved'))
    } catch (e) {
      console.error(e)
      showWarning(errorMessage(e, t('submission.save_failed')))
    }
  })

  useEvent('submission:share', async () => {
    try {
      await shareSubmission()
    } catch (e) {
      console.error(e)
      showWarning(errorMessage(e, t('submission.save_failed')))
    }
  })

  useEvent('submission:open', e => {
    const open = async (file: File) => {
      try {
        const opened = await openSubmissionFile(file, local => window.confirm(t('submission.replace_confirm', { name: local.meta.name })))
        if (opened) navigate('/editor')
      } catch (err) {
        console.error(err)
        showWarning(errorMessage(err, t('submission.open_failed')))
      }
    }
    if (e.detail) open(e.detail)
    else promptSubmissionFile(open)
  }, [navigate])

  return toast ? <Toast role="status">{toast}</Toast> : null
}

export default SubmissionController
