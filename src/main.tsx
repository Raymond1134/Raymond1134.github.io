import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { preloadFont } from 'troika-three-text'
import './styles/global.css'
import App from './App.tsx'
import TextMode from './ui/TextMode.tsx'

const PRELOAD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,—·:/()'
preloadFont({ font: '/fonts/Inter-Regular.woff', characters: PRELOAD_CHARS }, () => {})

const hasWebGL2 = () => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

document.getElementById('seo-fallback')?.remove()

const webgl = hasWebGL2()

if (!webgl) document.getElementById('overture-shroud')?.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>{webgl ? <App /> : <TextMode standalone />}</StrictMode>,
)
