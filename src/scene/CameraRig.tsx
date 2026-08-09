import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, getCurrentNode, TRAVEL, FADE } from '@/state/store'
import type { GraphNode } from '@/content/layout'
import { input, attachInput, settleInput, setLookScale } from '@/input/input'
import { breath, BREATH_HZ } from '@/scene/breath'
import { worldEvents } from '@/scene/worldEvents'
import { EASE, swellTight } from '@/motion/tokens'
import { playPicardy, picardyReady } from '@/audio/score'
import { panelSizeFor, PANEL_Z, PANEL_LIFT } from '@/scene/ui3d/panelLayout'

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpM = new THREE.Matrix4()
const baseQuat = new THREE.Quaternion()
const toQuat = new THREE.Quaternion()
const offsetQuat = new THREE.Quaternion()
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ')
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const driftRight = new THREE.Vector3()
const driftUp = new THREE.Vector3()
const driftFwd = new THREE.Vector3()

const FOV_REST = 62
const FOV_GATHER = 60.5

const CALM = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const DRIFT_LAT = CALM ? 0 : 1.2
const DRIFT_VERT = CALM ? 0 : 0.7
const DRIFT_FWD = CALM ? 0.45 : 0.9
const DRIFT_LOOK = CALM ? 0 : 0.004

const ROLL_A = CALM ? 0 : 1.6 * (Math.PI / 180)
const ROLL_B = CALM ? 0 : 0.7 * (Math.PI / 180)
const suspensionRoll = (t: number) =>
  ROLL_A * Math.sin(2 * Math.PI * 0.031 * t) + ROLL_B * Math.sin(2 * Math.PI * 0.0173 * t + 2.2)

function baseTowards(from: THREE.Vector3, target: THREE.Vector3, out: THREE.Quaternion) {
  tmpM.lookAt(from, target, WORLD_UP)
  return out.setFromRotationMatrix(tmpM)
}

function applyLook(camera: THREE.Camera, target: THREE.Vector3, swayYaw: number, swayPitch: number, swayRoll = 0) {
  baseTowards(camera.position, target, baseQuat)

  lookEuler.set(
    input.look.pitch + (input.gyro?.y ?? 0) + swayPitch,
    input.look.yaw + (input.gyro?.x ?? 0) + swayYaw,
    swayRoll,
    'YXZ',
  )
  offsetQuat.setFromEuler(lookEuler)

  camera.quaternion.copy(baseQuat).multiply(offsetQuat)
}

function anchorDistance(camera: THREE.PerspectiveCamera, panelWidth: number, panelHeight: number) {
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  const distForWidth = panelWidth / 2 / Math.tan(hFov / 2)
  const distForHeight = panelHeight / 2 / Math.tan(vFov / 2)

  return Math.max(distForWidth, distForHeight) * 1.35
}

const RISE = 0.09
const APPROACH_TILT = Math.sin(THREE.MathUtils.degToRad(20))
const ORBIT_TILT = THREE.MathUtils.degToRad(30)
const orbitAim = new THREE.Vector3()

function anchorFor(out: THREE.Vector3, node: { worldPosition: THREE.Vector3 }, distance: number, approach: THREE.Vector3) {
  return out
    .copy(node.worldPosition)
    .addScaledVector(approach, distance)
    .addScaledVector(WORLD_UP, distance * RISE)
}

function approachTo(from: THREE.Vector3, node: GraphNode, distance: number, out: THREE.Vector3) {
  out.copy(from).addScaledVector(WORLD_UP, -distance * RISE).sub(node.worldPosition)
  if (out.lengthSq() < 1e-6) out.copy(node.outward).negate()
  out.normalize()
  if (Math.abs(out.y) > APPROACH_TILT) {
    let hx = out.x
    let hz = out.z
    let h = Math.hypot(hx, hz)
    if (h < 1e-4) {
      hx = node.outward.x
      hz = node.outward.z
      h = Math.hypot(hx, hz)
    }
    if (h < 1e-4) {
      hx = 0
      hz = 1
      h = 1
    }
    const k = Math.sqrt(1 - APPROACH_TILT * APPROACH_TILT) / h
    out.set(hx * k, Math.sign(out.y) * APPROACH_TILT, hz * k)
  }
  return out
}

function applyFov(camera: THREE.PerspectiveCamera, fov: number, height: number) {
  camera.fov = fov
  camera.updateProjectionMatrix()
  setLookScale((2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, height))
}

const ACCEL_END = 0.45
const A_JUNCTION = 0.65
function flightEase(ft: number) {
  return ft < ACCEL_END
    ? A_JUNCTION * Math.pow(ft / ACCEL_END, 2.2)
    : A_JUNCTION + (1 - A_JUNCTION) * (1 - Math.pow(1 - (ft - ACCEL_END) / (1 - ACCEL_END), 5))
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const domElement = useThree((s) => s.gl.domElement)
  const height = useThree((s) => s.size.height)
  const lookTarget = useRef(new THREE.Vector3())

  const frozenPos = useRef<THREE.Vector3 | null>(null)
  const frozenQuat = useRef(new THREE.Quaternion())

  const approach = useRef(new THREE.Vector3())

  const approachId = useRef<string | null>(null)
  const idleT = useRef(0)
  const prevPhase = useRef('idle')
  const fadeSnapped = useRef(false)

  const driftOff = useRef(new THREE.Vector3())
  useEffect(() => attachInput(domElement), [domElement])
  useEffect(() => {
    setLookScale((2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, height))
  }, [camera, camera.fov, height])

  useFrame((state, dt) => {
    const s = useStore.getState()
    s.tickTravel(Math.min(dt, 1 / 20))
    const t = state.clock.elapsedTime

    if (s.phase === 'idle' || s.phase === 'fade') settleInput(dt)
    else input.dolly -= input.dolly * (1 - Math.pow(0.02, dt))

    const current = getCurrentNode()
    const panel = panelSizeFor(s.portrait)
    const dist = anchorDistance(camera, panel.w, panel.h * (1 + 2 * PANEL_LIFT)) + PANEL_Z + input.dolly

    const idleTarget = s.phase === 'idle' ? 1 : 0
    idleT.current +=
      (idleTarget - idleT.current) * (1 - Math.exp(-(idleTarget > idleT.current ? 0.67 : 6) * dt))

    if (prevPhase.current === 'flight' && s.phase === 'settle') {
      const pl = worldEvents.pulse
      pl.origin.copy(current.worldPosition)
      pl.t0 = t
      pl.speed = 40
      pl.band = 8
      pl.force = 6
      pl.glow = 0.3
      const st = worldEvents.strike
      st.at = t
      const earned = s.travelCount === 2 && picardyReady()
      st.kind = earned ? 'picardy' : 'land'
      st.mag = earned ? 1.7 : 1
      st.origin.copy(current.worldPosition)
      if (earned) playPicardy(current.id)
    }
    if (s.phase !== 'fade') fadeSnapped.current = false
    prevPhase.current = s.phase

    let fov: number
    if (s.phase === 'turn') {
      fov = THREE.MathUtils.lerp(FOV_REST, FOV_GATHER, EASE.glide(Math.min(1, s.travelClock / TRAVEL.turn)))
    } else if (s.phase === 'flight') {
      const ft = THREE.MathUtils.clamp((s.travelClock - TRAVEL.turn) / TRAVEL.flight, 0, 1)
      fov = THREE.MathUtils.lerp(FOV_GATHER, FOV_REST, ft) + 4.5 * swellTight(ft)
    } else {
      fov = THREE.MathUtils.damp(camera.fov, FOV_REST + worldEvents.camFov, 8, dt)
    }
    if (Math.abs(fov - camera.fov) > 0.01) applyFov(camera, fov, height)

    if (s.phase === 'turn') {
      const target = s.pendingId ? s.graph.nodes.get(s.pendingId) : null
      const dest = target ? target.worldPosition : current.worldPosition

      if (!frozenPos.current) {
        frozenPos.current = camera.position.clone()
        frozenQuat.current.copy(camera.quaternion)

        if (target) {
          approachTo(camera.position, target, dist, approach.current)
          approachId.current = target.id
        }
      }
      driftOff.current.set(0, 0, 0)
      const tt = THREE.MathUtils.clamp(s.travelClock / TRAVEL.turn, 0, 1)
      driftFwd.set(0, 0, 1).applyQuaternion(frozenQuat.current)
      camera.position.copy(frozenPos.current).addScaledVector(driftFwd, 0.8 * EASE.gather(tt))

      const e = EASE.glide(tt)
      baseTowards(camera.position, dest, toQuat)
      camera.quaternion.copy(frozenQuat.current).slerp(toQuat, e)

      input.look.yaw = 0
      input.look.pitch = 0
      input.orbit.yaw = 0
      input.orbit.pitch = 0

      lookTarget.current.copy(dest)
      return
    }

    if (s.phase === 'flight') {
      const ft = THREE.MathUtils.clamp((s.travelClock - TRAVEL.turn) / TRAVEL.flight, 0, 1)
      const e = flightEase(ft)
      const from = frozenPos.current ?? camera.position
      const to = anchorFor(tmpB, current, dist, approach.current)
      camera.position.copy(tmpA.copy(from).lerp(to, e * (1 + 0.02 * swellTight(ft))))

      lookTarget.current.copy(current.worldPosition)
      input.look.yaw = 0
      input.look.pitch = 0
      input.orbit.yaw = 0
      input.orbit.pitch = 0
      applyLook(camera, lookTarget.current, 0, 0)
      return
    }

    if (s.phase === 'fade') {
      if (!fadeSnapped.current && s.travelClock >= FADE.close) {
        approachTo(camera.position, current, dist, approach.current)
        approachId.current = current.id
        camera.position.copy(anchorFor(tmpB, current, dist, approach.current))
        input.look.yaw = 0
        input.look.pitch = 0
        input.orbit.yaw = 0
        input.orbit.pitch = 0
        lookTarget.current.copy(current.worldPosition)
        driftOff.current.set(0, 0, 0)
        fadeSnapped.current = true
      }
      applyLook(camera, lookTarget.current, 0, 0)
      return
    }

    frozenPos.current = null

    camera.position.sub(driftOff.current)
    driftOff.current.set(0, 0, 0)

    if (approachId.current !== current.id) {
      approachTo(camera.position, current, dist, approach.current)
      approachId.current = current.id
    }

    let av = approach.current
    const ob = input.orbit
    if (ob.yaw !== 0 || ob.pitch !== 0) {
      const byaw = Math.atan2(av.x, av.z)
      const belev = Math.asin(THREE.MathUtils.clamp(av.y, -1, 1))
      const elev = THREE.MathUtils.clamp(belev + ob.pitch, -ORBIT_TILT, ORBIT_TILT)
      ob.pitch = elev - belev
      const yaw = byaw + ob.yaw
      av = orbitAim.set(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev))
    }

    camera.position.lerp(anchorFor(tmpB, current, dist, av), 1 - Math.pow(0.0015, dt))
    lookTarget.current.lerp(current.worldPosition, 1 - Math.pow(0.002, dt))

    const k = idleT.current
    if (k > 0.001 || worldEvents.camForward !== 0) {
      driftRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
      driftUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
      driftFwd.set(0, 0, -1).applyQuaternion(camera.quaternion)
      const lat =
        DRIFT_LAT * (s.compact ? 0.4 : 1) *
        (0.65 * Math.sin(2 * Math.PI * 0.023 * t) + 0.35 * Math.sin(2 * Math.PI * 0.0113 * t + 1.7))
      const vert = DRIFT_VERT * Math.sin(2 * Math.PI * 0.017 * t + 0.9)
      const fwd = DRIFT_FWD * (breath(t) - 0.5) * 2 * 0.5
      driftOff.current
        .addScaledVector(driftRight, lat * k)
        .addScaledVector(driftUp, vert * k)
        .addScaledVector(driftFwd, (fwd * k + worldEvents.camForward))
      camera.position.add(driftOff.current)
    }

    applyLook(
      camera,
      lookTarget.current,
      DRIFT_LOOK * Math.sin(2 * Math.PI * 0.011 * t) * k,
      DRIFT_LOOK * Math.sin(2 * Math.PI * BREATH_HZ * 0.5 * t + 2.1) * k + worldEvents.camPitch,
      suspensionRoll(t) * k,
    )
  })

  return null
}
