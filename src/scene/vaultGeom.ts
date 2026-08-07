import * as THREE from 'three'

export const ORACLE_DIR = new THREE.Vector3(0.22, 0.94, -0.26).normalize()

export const ORACLE_U = new THREE.Vector3()
  .crossVectors(new THREE.Vector3(0, 1, 0), ORACLE_DIR)
  .normalize()
export const ORACLE_V = new THREE.Vector3().crossVectors(ORACLE_DIR, ORACLE_U).normalize()

