import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, getCurrentNode, getPreviousNode, TRAVEL } from '@/state/store'
import { input, attachInput, settleInput } from '@/input/input'
import { panelSizeFor } from '@/scene/ui3d/panelLayout'

const LOOK_SIGN = -1
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpC = new THREE.Vector3()

export function anchorDistance(camera: THREE.PerspectiveCamera, panelWidth: number, panelHeight: number) {
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  const distForWidth = panelWidth / 2 / Math.tan(hFov / 2)
  const distForHeight = panelHeight / 2 / Math.tan(vFov / 2)

  return Math.max(distForWidth, distForHeight) * 1.35
}

export function anchorFor(node: { worldPosition: THREE.Vector3; outward: THREE.Vector3 }, distance: number) {
  return node.worldPosition.clone().addScaledVector(node.outward, -distance).add(new THREE.Vector3(0, distance * 0.09, 0))
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const domElement = useThree((s) => s.gl.domElement)
  const lookTarget = useRef(new THREE.Vector3())

  useEffect(() => attachInput(domElement), [domElement])

  useFrame((_, dt) => {
    const s = useStore.getState()
    s.tickTravel(Math.min(dt, 1 / 20))
    settleInput(dt)

    const current = getCurrentNode()
    const prev = getPreviousNode()
    const panel = panelSizeFor(s.compact, s.portrait)
    const dist = anchorDistance(camera, panel.w, panel.h) + input.dolly

    let camPos: THREE.Vector3
    let look: THREE.Vector3

    if (s.phase === 'veil' && prev) {
      const t = (s.travelClock - TRAVEL.gather) / TRAVEL.veil
      const e = t * t * (3 - 2 * t)
      const from = anchorFor(prev, dist)
      const to = anchorFor(current, dist)
      const mid = tmpA.copy(from).lerp(to, 0.5).addScaledVector(current.outward, dist * 1.2)
      camPos = cubicBezier(from, tmpB.copy(from).lerp(mid, 0.7), tmpC.copy(to).lerp(mid, 0.7), to, e)
      look = current.worldPosition
    }
    else {
      camPos = anchorFor(current, dist)
      look = current.worldPosition
    }

    const leanX = LOOK_SIGN * (input.lean.x + (input.gyro?.x ?? 0)) * dist * 0.2
    const leanY = LOOK_SIGN * (input.lean.y + (input.gyro?.y ?? 0)) * dist * 0.13
    const right = tmpA.set(1, 0, 0).applyQuaternion(camera.quaternion)
    const up = tmpB.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const desired = camPos.clone().addScaledVector(right, leanX).addScaledVector(up, leanY)

    if (s.phase === 'veil') camera.position.copy(desired)
    else {
      const base = input.dragging ? 0.00002 : 0.0015
      camera.position.lerp(desired, 1 - Math.pow(base, dt))
    }

    lookTarget.current.lerp(look, 1 - Math.pow(0.002, dt))
    camera.lookAt(lookTarget.current)
  })

  return null
}

function cubicBezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number): THREE.Vector3 {
  const u = 1 - t
  return new THREE.Vector3()
    .addScaledVector(p0, u * u * u)
    .addScaledVector(p1, 3 * u * u * t)
    .addScaledVector(p2, 3 * u * t * t)
    .addScaledVector(p3, t * t * t)
}
