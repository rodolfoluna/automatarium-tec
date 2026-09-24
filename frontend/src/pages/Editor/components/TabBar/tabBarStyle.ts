import { forwardRef } from 'react'
import { styled } from 'goober'

export const Bar = styled('div')`
  display: flex;
  align-items: stretch;
  background: var(--surface);
  border-bottom: 1px solid var(--toolbar);
  min-height: 2.4em;
  position: relative;
  z-index: 1;
`

export const Tabs = styled('div')`
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  scrollbar-width: thin;
  flex: 0 1 auto;
`

export const Tab = styled('div')<{ $active?: boolean, $dragOver?: boolean }>`
  display: flex;
  align-items: center;
  gap: .45em;
  padding: 0 .6em 0 .8em;
  max-width: 14em;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  border-right: 1px solid var(--toolbar);
  border-bottom: 3px solid transparent;
  opacity: .75;

  &:hover { opacity: 1; background: var(--toolbar); }

  ${p => p.$active && `
    opacity: 1;
    background: var(--bg);
    border-bottom-color: var(--primary);
  `}

  ${p => p.$dragOver && `
    box-shadow: inset 3px 0 0 var(--primary);
  `}

  span.name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

export const TypeChip = styled('span')<{ $color: string }>`
  font-size: .7em;
  font-weight: 700;
  padding: .1em .4em;
  border-radius: .3em;
  color: white;
  background: ${p => p.$color};
`

export const IconButton = styled('button', forwardRef)`
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: .2em;
  display: flex;
  align-items: center;
  border-radius: .3em;
  cursor: pointer;
  opacity: .7;

  &:hover { opacity: 1; background: var(--toolbar); }
  svg { height: 1em; width: 1em; }
`

export const RenameInput = styled('input', forwardRef)`
  font: inherit;
  width: 9em;
  padding: .1em .3em;
  border: 0;
  border-radius: .3em;
`

export const AddMenu = styled('div')`
  position: absolute;
  top: 100%;
  margin-top: .3em;
  display: flex;
  flex-direction: column;
  background: var(--toolbar);
  border-radius: .4em;
  padding: .3em;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .3);
  z-index: 10;

  button {
    font: inherit;
    color: var(--white);
    background: none;
    border: 0;
    text-align: left;
    padding: .4em .8em;
    border-radius: .3em;
    cursor: pointer;
    display: flex;
    gap: .6em;
    align-items: center;
  }
  button:hover { background: var(--primary); }
`
