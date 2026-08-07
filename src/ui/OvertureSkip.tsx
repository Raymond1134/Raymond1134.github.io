import { useEffect, useState } from 'react'
import { worldEvents } from '@/scene/worldEvents'
import '@/styles/skip.css'

const SHOW_AT_MS = 1000

export default function OvertureSkip() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setShown(true), SHOW_AT_MS)
    return () => clearTimeout(id)
  }, [])

  if (!shown) return null

  return (
    <button
      type="button"
      className="skip"
      onClick={() => {
        worldEvents.skipOverture = true
      }}
    >
      skip <span aria-hidden>→</span>
    </button>
  )
}
