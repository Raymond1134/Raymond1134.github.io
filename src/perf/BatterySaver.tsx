import { useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import '@/styles/hint.css'

interface BatteryLike {
  level: number
  charging: boolean
}

type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryLike> }

export default function BatterySaver() {
  const [toast, setToast] = useState(false)

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery
    const getBattery = nav.getBattery
    if (typeof getBattery !== 'function') return

    let live = true
    let toastTimer: ReturnType<typeof setTimeout> | undefined

    void (async () => {
      try {
        const b = await getBattery.call(nav)
        if (!live || b.charging || b.level >= 0.2) return
        const s = useStore.getState()
        if (s.quality !== 'low') {
          s.setQuality('low')
          setToast(true)
          toastTimer = setTimeout(() => setToast(false), 2500)
        }
      } catch {}
    })()

    return () => {
      live = false
      clearTimeout(toastTimer)
    }
  }, [])

  if (!toast) return null
  return (
    <p className="hint" role="status">
      conserving light
    </p>
  )
}
