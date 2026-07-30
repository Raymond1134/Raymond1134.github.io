import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, getCurrentNode, TRAVEL } from '@/state/store'
import type { GraphNode } from '@/content/layout'
import { input, attachInput, settleInput, setLookScale } from '@/input/input'
import { panelSizeFor, PANEL_Z, PANEL_LIFT } from '@/scene/ui3d/panelLayout'

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpM = new THREE.Matrix4()
const baseQuat = new THREE.Quaternion()
const toQuat = new THREE.Quaternion()
const offsetQuat = new THREE.Quaternion()
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ')
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/* Orientation that faces `target` from `from`, free look aside. */
function baseTowards(from: THREE.Vector3, target: THREE.Vector3, out: THREE.Quaternion) {
  tmpM.lookAt(from, target, WORLD_UP)
  return out.setFromRotationMatrix(tmpM)
}

/* Point the camera at `target`, then lay free look over the top. */
function applyLook(camera: THREE.Camera, target: THREE.Vector3) {
  baseTowards(camera.position, target, baseQuat)

  lookEuler.set(
    input.look.pitch + (input.gyro?.y ?? 0),
    input.look.yaw + (input.gyro?.x ?? 0),
    0,
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

/* Fraction of the anchor distance the camera sits above the beacon it reads. */
const RISE = 0.09

function anchorFor(out: THREE.Vector3, node: { worldPosition: THREE.Vector3 }, distance: number, approach: THREE.Vector3) {
  return out
    .copy(node.worldPosition)
    .addScaledVector(approach, distance)
    .addScaledVector(WORLD_UP, distance * RISE)
}

/* The side `node` is being viewed from: the direction from the beacon out towards `from`, written into `out`. */
function approachTo(from: THREE.Vector3, node: GraphNode, distance: number, out: THREE.Vector3) {
  out.copy(from).addScaledVector(WORLD_UP, -distance * RISE).sub(node.worldPosition)
  if (out.lengthSq() < 1e-6) out.copy(node.outward).negate()
  return out.normalize()
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const domElement = useThree((s) => s.gl.domElement)
  const height = useThree((s) => s.size.height)
  const lookTarget = useRef(new THREE.Vector3())

  /* Captured on the first turn frame, released once the flight lands. */
  const frozenPos = useRef<THREE.Vector3 | null>(null)
  const frozenQuat = useRef(new THREE.Quaternion())

  /* Which side we are reading the current beacon from. */
  const approach = useRef(new THREE.Vector3())

  const approachId = useRef<string | null>(null)
  useEffect(() => attachInput(domElement), [domElement])
  useEffect(() => {
    setLookScale((2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, height))
  }, [camera, camera.fov, height])

  useFrame((_, dt) => {
    const s = useStore.getState()
    s.tickTravel(Math.min(dt, 1 / 20))

    if (s.phase === 'idle') settleInput(dt)
    else input.dolly -= input.dolly * (1 - Math.pow(0.02, dt))

    const current = getCurrentNode()
    const panel = panelSizeFor(s.compact, s.portrait)
    const dist = anchorDistance(camera, panel.w, panel.h * (1 + 2 * PANEL_LIFT)) + PANEL_Z + input.dolly

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
      camera.position.copy(frozenPos.current)
      const t = THREE.MathUtils.clamp(s.travelClock / TRAVEL.turn, 0, 1)
      const e = t * t * (3 - 2 * t)

      baseTowards(camera.position, dest, toQuat)
      camera.quaternion.copy(frozenQuat.current).slerp(toQuat, e)

      input.look.yaw = 0
      input.look.pitch = 0

      lookTarget.current.copy(dest)
      return
    }

    if (s.phase === 'flight') {
      const t = (s.travelClock - TRAVEL.turn) / TRAVEL.flight
  
      // Cubic ease-in-out
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      const from = frozenPos.current ?? camera.position
      const to = anchorFor(tmpB, current, dist, approach.current)
      camera.position.copy(tmpA.copy(from).lerp(to, e))

      lookTarget.current.copy(current.worldPosition)
      input.look.yaw = 0
      input.look.pitch = 0
      applyLook(camera, lookTarget.current)
      return
    }

    frozenPos.current = null

    if (approachId.current !== current.id) {
      approachTo(camera.position, current, dist, approach.current)
      approachId.current = current.id
    }

    camera.position.lerp(anchorFor(tmpB, current, dist, approach.current), 1 - Math.pow(0.0015, dt))
    lookTarget.current.lerp(current.worldPosition, 1 - Math.pow(0.002, dt))
    applyLook(camera, lookTarget.current)
  })

  return null
}

