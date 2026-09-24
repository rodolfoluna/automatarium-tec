import { styled } from 'goober'

export const Card = styled('form')`
  max-width: 460px;
  margin: 8vh auto 2em;
  padding: 2em 1.6em;
  background: var(--surface);
  border-radius: .6em;
  display: flex;
  flex-direction: column;
  gap: 1em;

  h1 { margin: 0; font-size: 1.6em; }
  p { margin: 0; line-height: 1.4; }
`

export const Field = styled('label')`
  display: flex;
  flex-direction: column;
  gap: .35em;
  font-weight: 600;

  small { font-weight: normal; opacity: .75; }
`

export const Check = styled('label')`
  display: flex;
  gap: .6em;
  align-items: flex-start;
  line-height: 1.35;
  input { margin-top: .25em; }
`

export const ErrorText = styled('span')`
  color: var(--error-text, #e74c3c);
  font-size: .9em;
`

export const Summary = styled('div')`
  background: var(--toolbar);
  border-radius: .4em;
  padding: .8em 1em;
  line-height: 1.6;
`
