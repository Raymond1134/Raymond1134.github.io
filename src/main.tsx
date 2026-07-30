import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { preloadFont } from 'troika-three-text'
import './styles/global.css'
import App from './App.tsx'

/* Warm the SDF. */
const PRELOAD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,—·:/()'
preloadFont({ font: '/fonts/Inter-SemiBold.woff', characters: PRELOAD_CHARS }, () => {})
preloadFont({ font: '/fonts/Inter-Regular.woff', characters: PRELOAD_CHARS }, () => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
