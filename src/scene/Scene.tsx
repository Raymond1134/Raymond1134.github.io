import CameraRig from './CameraRig'
import AudioFrameSync from '@/audio/AudioFrameSync'
import OvertureDirector from './OvertureDirector'
import EventDirector from './EventDirector'
import AetherDepths from './AetherDepths'
import GreatVault from './GreatVault'
import LensFlare from './LensFlare'
import DeepLayer from './DeepLayer'
import ParticleField from './ParticleField'
import Loom from './Loom'
import Beacons from './beacons/Beacons'
import HoloPanel from './ui3d/HoloPanel'
import Veil from './Veil'
import Post from './Post'

export default function Scene() {
  return (
    <>
      <CameraRig />
      <AudioFrameSync />
      <OvertureDirector />
      <EventDirector />
      <AetherDepths />
      <GreatVault />
      <DeepLayer />
      <ParticleField />
      <Loom />
      <Beacons />
      <HoloPanel />
      <LensFlare />
      <Veil />
      <Post />
    </>
  )
}
