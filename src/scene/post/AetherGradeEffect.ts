import { Effect } from 'postprocessing'
import * as THREE from 'three'
import frag from '@/shaders/post/aetherGrade.frag'

export class AetherGradeEffect extends Effect {
  constructor(hold: number, ditherK: number) {
    super('AetherGrade', frag, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uExposure', new THREE.Uniform(1)],
        ['uHold', new THREE.Uniform(hold)],
        ['uRes', new THREE.Uniform(new THREE.Vector2(1, 1))],
        ['uDitherK', new THREE.Uniform(ditherK)],
      ]),
    })
  }

  setSize(width: number, height: number) {
    ;(this.uniforms.get('uRes')!.value as THREE.Vector2).set(width, height)
  }

  set exposure(v: number) {
    this.uniforms.get('uExposure')!.value = v
  }
}
