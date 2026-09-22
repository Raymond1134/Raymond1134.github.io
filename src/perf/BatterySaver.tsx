import { useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import '@/styles/hint.css'

interface BatteryLike extends EventTarget {
  level: number
  charging: boolean
}

type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryLike> }

const TOAST_MS = 2500
const HINTS_CLEAR_MS = 10_000

export default function BatterySaver() {
  const saver = useStore((s) => s.saver)
  const overture = useStore((s) => s.overtureActive)
  const [seen, setSeen] = useState(overture)
  const [settled, setSettled] = useState(false)
  const [told, setTold] = useState(false)
  if (overture && !seen) setSeen(true)
  const toast = saver && settled && !told

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery
    const getBattery = nav.getBattery
    if (typeof getBattery !== 'function') return

    let live = true
    let battery: BatteryLike | null = null
    const sync = () => {
      if (live && battery) useStore.getState().setSaver(!battery.charging && battery.level < 0.2)
    }

    void (async () => {
      try {
        const b = await getBattery.call(nav)
        if (!live) return
        battery = b
        sync()
        b.addEventListener('chargingchange', sync)
        b.addEventListener('levelchange', sync)
      } catch {}
    })()

    return () => {
      live = false
      battery?.removeEventListener('chargingchange', sync)
      battery?.removeEventListener('levelchange', sync)
    }
  }, [])

  useEffect(() => {
    if (!seen || overture) return
    const id = setTimeout(() => setSettled(true), HINTS_CLEAR_MS)
    return () => clearTimeout(id)
  }, [seen, overture])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setTold(true), TOAST_MS)
    return () => clearTimeout(id)
  }, [toast])

  if (!toast) return null
  return (
    <p className="hint" role="status">
      conserving light
    </p>
  )
}
