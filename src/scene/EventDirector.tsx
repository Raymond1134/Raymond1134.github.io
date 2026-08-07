import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/state/store'
import { worldEvents } from './worldEvents'
import { breathState, nextInhale, BREATH_HZ } from './breath'
import { stillFor } from '@/input/input'
import { swell, EASE } from '@/motion/tokens'
import {
  playHearthFlare, playMigration, playAuroraVeil, playDeepBreath,
  playClerestory, playSwellEvent, playQuake, playToll,
} from '@/audio/score'

type Kind = 'flare' | 'migration' | 'aurora' | 'breath'

type ShowKind = 'clerestory' | 'swellEv' | 'quake' | 'toll'

interface Show {
  kind: ShowKind
  t0: number
  dur: number
}

const SHOW: Record<ShowKind, { dur: number; cd: number; w: number }> = {
  clerestory: { dur: 9, cd: 55, w: 26 },
  swellEv: { dur: 5, cd: 48, w: 24 },
  toll: { dur: 4.5, cd: 60, w: 22 },
  quake: { dur: 2.2, cd: 200, w: 12 },
}

interface Active {
  kind: Kind
  t0: number
  dur: number
  id: string | null
  from: THREE.Vector3
  to: THREE.Vector3
}

const COOLDOWN: Record<Kind, number> = { flare: 45, migration: 40, aurora: 70, breath: 60 }
const DUR: Record<Kind, number> = { flare: 6, migration: 16, aurora: 14, breath: 1 / BREATH_HZ }
const WEIGHT: Array<[Kind, number]> = [
  ['flare', 28],
  ['migration', 42],
  ['aurora', 18],
  ['breath', 12],
]

const tmp = new THREE.Vector3()

export default function EventDirector() {
  const nextAt = useRef(-1)
  const active = useRef<Active | null>(null)
  const lastFired = useRef<Record<Kind, number>>({ flare: -1e9, migration: -1e9, aurora: -1e9, breath: -1e9 })
  const pendingBreathAt = useRef(-1)
  const show = useRef<Show | null>(null)
  const showNextAt = useRef(-1)
  const lastShow = useRef<Record<ShowKind, number>>({ clerestory: -1e9, swellEv: -1e9, quake: -1e9, toll: -1e9 })

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const s = useStore.getState()
    const calm = s.reducedMotion
    const lowTier = s.quality === 'low' || s.compact
    const mag = calm ? 0.7 : 1

    const g = worldEvents.grade
    const st = worldEvents.strike
    const age = t - st.at
    const big = st.kind === 'picardy' || st.kind === 'ignite'
    const atk = big ? 0.45 : 0.22
    const dec = big ? 4.2 : 1.6
    let k = 0
    if (age >= 0 && age < atk + dec) {
      k = age < atk ? EASE.hearth(age / atk) : 1 - EASE.hearth((age - atk) / dec)
    }
    const km = Math.min(1.7, k * (st.mag || 1)) * (calm ? 0.45 : 1)

    let spShaft = 0
    let spVault = 0
    let spCaustic = 0
    const sp = show.current
    if (sp) {
      const k2 = Math.min(1, (t - sp.t0) / sp.dur)
      const sw = swell(k2) * (calm ? 0.45 : 1)
      if (sp.kind === 'clerestory') {
        worldEvents.solo.gain = 2.4 * sw
        spCaustic = 0.35 * sw
      } else if (sp.kind === 'swellEv') {
        spCaustic = 1.0 * sw
        spVault = -0.15 * sw
      } else if (sp.kind === 'toll') {
        spVault = 0.6 * sw
        spShaft = 0.25 * sw
      }
      if (k2 >= 1) {
        worldEvents.solo.gain = 0
        show.current = null
      }
    }

    g.ignite = 1 + 0.80 * km
    g.shaft = 1 + 1.00 * km + spShaft
    g.vault = 1 + 0.50 * km + spVault
    g.glare = 1 + 0.30 * km
    g.exposure = 1 + 0.12 * km
    g.caustic = Math.min(1.7, km + spCaustic)

    if (showNextAt.current < 0) {
      showNextAt.current = t + 14 + Math.random() * 8
    } else if (!show.current && t >= showNextAt.current) {
      if (
        s.phase === 'flight' ||
        s.overtureActive ||
        s.mapOpen ||
        s.textMode ||
        document.hidden ||
        t - st.at < 2.5
      ) {
        showNextAt.current = t + 4 + Math.random() * 4
      } else {
        const pool = (Object.keys(SHOW) as ShowKind[]).filter(
          (kd) => t - lastShow.current[kd] >= SHOW[kd].cd,
        )
        if (pool.length === 0) {
          showNextAt.current = t + 8 + Math.random() * 6
        } else {
          const total = pool.reduce((sum, kd) => sum + SHOW[kd].w, 0)
          let roll = Math.random() * total
          let pick: ShowKind = pool[0]
          for (const kd of pool) {
            roll -= SHOW[kd].w
            if (roll <= 0) {
              pick = kd
              break
            }
          }
          lastShow.current[pick] = t
          show.current = { kind: pick, t0: t, dur: SHOW[pick].dur }
          showNextAt.current = t + (lowTier ? 34 + Math.random() * 20 : 21 + Math.random() * 13)

          if (pick === 'clerestory') {
            playClerestory(SHOW.clerestory.dur)
          } else if (pick === 'swellEv') {
            playSwellEvent(SHOW.swellEv.dur)
          } else if (pick === 'toll') {
            playToll()
          } else {
            const node = s.graph.nodes.get(s.currentId)
            if (node) {
              const pl = worldEvents.pulse
              pl.origin.copy(node.worldPosition)
              pl.t0 = t
              pl.speed = 220
              pl.band = 40
              pl.force = 4
              pl.glow = 0.15
            }
            playQuake()
          }
        }
      }
    }

    const a = active.current
    if (a) {
      const tau = t - a.t0
      const k = Math.min(1, tau / a.dur)
      if (a.kind === 'flare') {
        worldEvents.flare.gain = swell(k) * mag
        if (k >= 1) worldEvents.flare.id = null
      } else if (a.kind === 'migration') {
        worldEvents.attractor.pos.copy(tmp.copy(a.from).lerp(a.to, k))
        worldEvents.attractor.w = 8 * swell(k)
      } else if (a.kind === 'aurora') {
        worldEvents.aurora.gain = 1.2 * swell(k) * mag
      } else {
        breathState.scale = 1 + 0.5 * swell(k) * mag
      }
      if (k >= 1) {
        if (a.kind === 'migration') worldEvents.attractor.w = 0
        if (a.kind === 'aurora') worldEvents.aurora.gain = 0
        if (a.kind === 'breath') breathState.scale = 1
        active.current = null
        const lull = lowTier ? 55 + Math.random() * 40 : 28 + Math.random() * 22
        nextAt.current = t + lull
      }
      return
    }

    if (pendingBreathAt.current >= 0) {
      if (t >= pendingBreathAt.current) {
        pendingBreathAt.current = -1
        active.current = { kind: 'breath', t0: t, dur: DUR.breath, id: null, from: tmp.clone(), to: tmp.clone() }
        lastFired.current.breath = t
        playDeepBreath()
      }
      return
    }

    if (nextAt.current < 0) {
      nextAt.current = t + 16 + Math.random() * 12
      return
    }
    if (t < nextAt.current) return

    if (
      s.phase !== 'idle' ||
      s.overtureActive ||
      s.mapOpen ||
      s.textMode ||
      document.hidden ||
      stillFor() < 10
    ) {
      nextAt.current = t + 8 + Math.random() * 7
      return
    }

    const dropMoving = lowTier || calm
    const pool = WEIGHT.filter(
      ([kind]) =>
        !(dropMoving && kind === 'migration') &&
        t - lastFired.current[kind] >= COOLDOWN[kind],
    )
    if (pool.length === 0) {
      nextAt.current = t + 10 + Math.random() * 10
      return
    }
    const total = pool.reduce((sum, [, w]) => sum + w, 0)
    let roll = Math.random() * total
    let kind: Kind = pool[0][0]
    for (const [kd, w] of pool) {
      roll -= w
      if (roll <= 0) {
        kind = kd
        break
      }
    }

    const cam = state.camera
    if (kind === 'breath') {
      pendingBreathAt.current = t + nextInhale(t)
      return
    }

    lastFired.current[kind] = t
    const ev: Active = { kind, t0: t, dur: DUR[kind], id: null, from: new THREE.Vector3(), to: new THREE.Vector3() }

    if (kind === 'flare') {
      const far = [...s.graph.nodes.values()].filter(
        (n) => n.id !== s.currentId && cam.position.distanceTo(n.worldPosition) > 120,
      )
      if (far.length === 0) {
        nextAt.current = t + 15
        return
      }
      const pick = far[(Math.random() * far.length) | 0]
      ev.id = pick.id
      worldEvents.flare.id = pick.id
      worldEvents.flare.gain = 0
      playHearthFlare(pick.id, DUR.flare)
    } else if (kind === 'migration') {
      const dir = tmp.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.5, Math.random() - 0.5).normalize()
      cam.getWorldDirection(worldEvents.attractor.pos)
      ev.from.copy(cam.position).addScaledVector(worldEvents.attractor.pos, 40).addScaledVector(dir, -55)
      ev.to.copy(ev.from).addScaledVector(dir, 110)
      const ids = [...s.graph.nodes.keys()]
      playMigration(ids[(Math.random() * ids.length) | 0], ids[(Math.random() * ids.length) | 0], DUR.migration)
    } else if (kind === 'aurora') {
      worldEvents.aurora.dir
        .set(Math.random() - 0.5, 0.5 + Math.random() * 0.5, Math.random() - 0.5)
        .normalize()
      playAuroraVeil(DUR.aurora)
    }

    active.current = ev
  })

  return null
}
