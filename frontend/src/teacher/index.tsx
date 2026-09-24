import { StrictMode, createElement } from 'react'
import ReactDOM from 'react-dom'
import { setup } from 'goober'
import TeacherApp from './TeacherApp'

setup(
  createElement,
  undefined, undefined,
  // Quitar props transitorias del DOM
  props => Object.keys(props).forEach(p => p[0] === '$' && delete props[p])
)

document.body.style.background = 'var(--grid-bg-dark)'
document.body.classList.add('dark')

ReactDOM.render(<StrictMode><TeacherApp /></StrictMode>, document.getElementById('app'))
