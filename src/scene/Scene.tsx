import CameraRig from './CameraRig'
import ParticleField from './ParticleField'
import Beacons from './beacons/Beacons'
import HoloPanel from './ui3d/HoloPanel'
import Veil from './Veil'

export default function Scene() {
  return (
    <>
      <CameraRig />
      <ParticleField />
      <Beacons />
      <HoloPanel />
      {/* Last: useFrame runs priority-0 callbacks in mount order, and the veil
          has to pin itself to the camera position CameraRig set this frame. */}
      <Veil />
    </>
  )
}
