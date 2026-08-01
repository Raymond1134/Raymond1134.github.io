import CameraRig from './CameraRig'
import AetherDepths from './AetherDepths'
import ParticleField from './ParticleField'
import Ribbons from './Ribbons'
import Beacons from './beacons/Beacons'
import HoloPanel from './ui3d/HoloPanel'
import Veil from './Veil'
import Post from './Post'

export default function Scene() {
  return (
    <>
      <CameraRig />
      {/* Right after the rig: its useFrame must read the camera pose set
          this frame. */}
      <AetherDepths />
      <ParticleField />
      <Ribbons />
      <Beacons />
      <HoloPanel />
      {/* Last: useFrame runs priority-0 callbacks in mount order, and the veil
          has to pin itself to the camera position CameraRig set this frame. */}
      <Veil />
      {/* The composer owns tone mapping — gl.toneMapping stays NoToneMapping. */}
      <Post />
    </>
  )
}
