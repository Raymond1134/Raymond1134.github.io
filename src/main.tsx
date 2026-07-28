import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.tsx'


import { graph } from '@/content'
console.table([...graph.nodes.values()].map(n => ({
  id: n.id, depth: n.depth,
  pos: n.worldPosition.toArray().map(v => v.toFixed(0)).join(','),
})))


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
