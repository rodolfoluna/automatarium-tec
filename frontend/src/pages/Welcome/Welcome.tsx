import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeControlNumber } from '@automatarium/secure-file'

import { Button, Input, Logo } from '/src/components'
import { useStudentStore } from '/src/stores'
import { CONTROL_NUMBER_PATTERN, INSTITUTION_NAME } from '/src/tec/config'
import { Card, Check, ErrorText, Field, Summary } from './welcomeStyle'

/** Registro del alumno la primera vez que abre la app */
const Welcome = () => {
  const { t } = useTranslation('tec')
  const register = useStudentStore(s => s.register)

  const [controlNumber, setControlNumber] = useState('')
  const [name, setName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  const cleanControl = normalizeControlNumber(controlNumber)
  const cleanName = name.trim().replace(/\s+/g, ' ')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!CONTROL_NUMBER_PATTERN.test(cleanControl)) return setError(t('welcome.error_control'))
    if (cleanName.split(' ').length < 2) return setError(t('welcome.error_name'))
    if (!accepted) return setError(t('welcome.error_accept'))
    setError('')
    if (!confirming) return setConfirming(true)
    register(cleanControl, cleanName)
  }

  return (
    <Card onSubmit={handleSubmit}>
      <div style={{ width: '3.5em' }}><Logo /></div>
      <h1>{t('welcome.title')}</h1>
      <p>{t('welcome.intro', { institution: INSTITUTION_NAME })}</p>

      {confirming
        ? <>
          <p><strong>{t('welcome.confirm_title')}</strong></p>
          <Summary>
            {t('welcome.control_label')}: <strong>{cleanControl}</strong><br />
            {t('welcome.name_label')}: <strong>{cleanName}</strong>
          </Summary>
          <p>{t('welcome.confirm_warning')}</p>
          <div style={{ display: 'flex', gap: '.6em', justifyContent: 'flex-end' }}>
            <Button secondary onClick={() => setConfirming(false)}>{t('welcome.back')}</Button>
            <Button type="submit">{t('welcome.confirm')}</Button>
          </div>
        </>
        : <>
          <Field>
            {t('welcome.control_label')}
            <Input
              value={controlNumber}
              onChange={e => setControlNumber(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              placeholder="C21400123"
              autoFocus
              required
            />
            <small>{t('welcome.control_help')}</small>
          </Field>
          <Field>
            {t('welcome.name_label')}
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              placeholder={t('welcome.name_placeholder')}
              required
            />
          </Field>
          <Check>
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
            <span>{t('welcome.accept')}</span>
          </Check>
          <Button type="submit">{t('welcome.continue')}</Button>
        </>}
      {error && <ErrorText role="alert">{error}</ErrorText>}
    </Card>
  )
}

export default Welcome
