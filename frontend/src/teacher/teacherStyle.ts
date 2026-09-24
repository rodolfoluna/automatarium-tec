import { forwardRef } from 'react'
import { styled } from 'goober'

export const Layout = styled('div')`
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5em 1em 4em;
  color: var(--white);
  font-family: var(--font-body);
`

export const Header = styled('header')`
  display: flex;
  align-items: center;
  gap: .6em;
  h1 { font-family: var(--font-header); margin: 0; font-size: 1.6em; }
`

export const Row = styled('div')`
  display: flex;
  align-items: center;
  gap: .6em;
  flex-wrap: wrap;
`

export const Card = styled('section')`
  background: var(--surface);
  border-radius: .6em;
  padding: 1em 1.2em;
  margin: 1em 0;
  display: flex;
  flex-direction: column;
  gap: .7em;
  h2, h3 { margin: 0; }
  p { margin: 0; line-height: 1.4; }
  details summary { cursor: pointer; }
`

export const DropArea = styled('div')<{ $active?: boolean }>`
  margin-top: 1em;
  border: 2px dashed var(--toolbar);
  border-radius: .6em;
  padding: 1.5em;
  text-align: center;
  ${p => p.$active && 'border-color: var(--primary); background: var(--surface);'}
  p { margin: 0 0 .6em; }
`

export const Badge = styled('span')<{ $color: string }>`
  display: inline-block;
  padding: .15em .6em;
  border-radius: 1em;
  font-size: .85em;
  font-weight: 700;
  color: white;
  white-space: nowrap;
  background: ${p => p.$color};
`

export const SmallButton = styled('button', forwardRef)<{ $active?: boolean }>`
  font: inherit;
  color: var(--white);
  background: ${p => p.$active ? 'var(--primary)' : 'var(--toolbar)'};
  border: 0;
  border-radius: .4em;
  padding: .45em .9em;
  cursor: pointer;
  &:hover { filter: brightness(1.15); }
  &:disabled { opacity: .5; cursor: default; }
`

export const TextInput = styled('input', forwardRef)`
  font: inherit;
  padding: .5em .7em;
  border-radius: .4em;
  border: 1px solid var(--input-border);
`

export const Table = styled('table')`
  width: 100%;
  border-collapse: collapse;
  th, td { text-align: left; padding: .55em .6em; border-bottom: 1px solid var(--toolbar); vertical-align: top; }
  th { font-size: .85em; opacity: .8; }
  tbody tr { cursor: pointer; }
  tbody tr:hover, tbody tr[aria-selected="true"] { background: var(--surface); }
  td:last-child { font-size: .9em; opacity: .9; }
`

export const Detail = styled('div')`
  margin-top: 2em;
  border-top: 2px solid var(--toolbar);
  padding-top: 1.2em;
`

export const Finding = styled('div')<{ $level: string }>`
  line-height: 1.4;
  ${p => p.$level === 'info' && 'opacity: .75;'}
`

export const TabTitle = styled('div')`
  display: flex;
  align-items: center;
  gap: .6em;
  flex-wrap: wrap;
`
