import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { preloadFont } from 'troika-three-text'
import './styles/global.css'
import App from './App.tsx'
import TextMode from './ui/TextMode.tsx'
import { WEBGL2 } from './perf/gpuTier'

const PRELOAD_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,—–-·:;/()’\'"&|$+!?#@%'
preloadFont({ font: '/fonts/Inter-Regular.woff', characters: PRELOAD_CHARS }, () => {})
preloadFont({ font: '/fonts/Inter-SemiBold.woff', characters: PRELOAD_CHARS }, () => {})

document.getElementById('seo-fallback')?.remove()

if (!WEBGL2) document.getElementById('overture-shroud')?.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>{WEBGL2 ? <App /> : <TextMode standalone />}</StrictMode>,
)
