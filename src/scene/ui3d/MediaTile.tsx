import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { Media } from '@/content/schema'
import { useStore } from '@/state/store'
import { input, TAP_SLOP } from '@/input/input'
import { glowTexture } from '@/scene/glowTexture'

interface TileProps {
  media: Media
  position: [number, number, number]
  width: number
  accent: THREE.Color
  fadeRef: { current: number }
}

const applySRGB = (t: THREE.Texture | THREE.Texture[]) => {
  for (const tex of Array.isArray(t) ? t : [t]) tex.colorSpace = THREE.SRGBColorSpace
}

export default function MediaTile(props: TileProps) {
  if (props.media.type === 'video') return <VideoTile {...props} />
  return <ImageTile {...props} />
}

function TileChrome({
  w,
  h,
  accent,
  fadeRef,
}: {
  w: number
  h: number
  accent: THREE.Color
  fadeRef: { current: number }
}) {
  const edges = useMemo(() => {
    const plane = new THREE.PlaneGeometry(w + 0.3, h + 0.3)
    const built = new THREE.EdgesGeometry(plane)
    plane.dispose()
    return built
  }, [w, h])
  useEffect(() => () => edges.dispose(), [edges])

  const lineMat = useRef<THREE.LineBasicMaterial>(null)
  const glowMat = useRef<THREE.SpriteMaterial>(null)

  useFrame(() => {
    const f = fadeRef.current
    if (lineMat.current) lineMat.current.opacity = f * 0.3
    if (glowMat.current) glowMat.current.opacity = f * 0.22
  })

  return (
    <>
      <lineSegments geometry={edges}>
        <lineBasicMaterial ref={lineMat} color={accent} transparent opacity={0} toneMapped={false} />
      </lineSegments>
      <sprite position={[0, 0, -0.15]} scale={[w * 1.5, h * 1.7, 1]}>
        <spriteMaterial
          ref={glowMat}
          map={glowTexture()}
          color={accent}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </sprite>
    </>
  )
}

function ImageTile({ media, position, width: w, accent, fadeRef }: TileProps) {
  const tex = useTexture(media.src, applySRGB)
  const img = tex.image as { width: number; height: number } | undefined
  const aspect = img ? img.width / img.height : 1.6
  const h = w / aspect

  const group = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(() => {
    const f = fadeRef.current
    if (group.current) group.current.visible = f > 0.01
    if (mat.current) mat.current.opacity = f * 0.92
  })

  return (
    <group ref={group} position={position}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial ref={mat} map={tex} transparent opacity={0} toneMapped={false} />
      </mesh>
      <TileChrome w={w} h={h} accent={accent} fadeRef={fadeRef} />
    </group>
  )
}

interface VideoAssets {
  video: HTMLVideoElement
  tex: THREE.VideoTexture
}

interface SurfaceProps extends TileProps {
  poster: THREE.Texture | null
}

function VideoTile(props: TileProps) {
  if (props.media.poster) return <PosterVideoTile {...props} posterSrc={props.media.poster} />
  return <VideoSurface {...props} poster={null} />
}

function PosterVideoTile({ posterSrc, ...props }: TileProps & { posterSrc: string }) {
  const poster = useTexture(posterSrc, applySRGB)
  return <VideoSurface {...props} poster={poster} />
}

function VideoSurface({ media, position, width: w, accent, fadeRef, poster }: SurfaceProps) {
  const coarse = useStore((s) => s.coarse)
  const [playing, setPlaying] = useState(false)
  const assetsRef = useRef<VideoAssets | null>(null)
  const [assets, setAssets] = useState<VideoAssets | null>(null)
  const group = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const playMat = useRef<THREE.MeshBasicMaterial>(null)

  useEffect(() => {
    const video = document.createElement('video')
    video.src = media.src
    video.crossOrigin = 'anonymous'
    video.loop = true
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.preload = coarse ? 'none' : 'auto'

    const tex = new THREE.VideoTexture(video)
    tex.colorSpace = THREE.SRGBColorSpace

    assetsRef.current = { video, tex }
    setAssets({ video, tex })

    if (!coarse) {
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }

    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      tex.dispose()
      assetsRef.current = null
    }
  }, [media.src, coarse])

  useEffect(() => {
    const onVis = () => {
      const a = assetsRef.current
      if (!a) return
      if (document.hidden) a.video.pause()
      else if (playing) a.video.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [playing])

  useFrame(() => {
    const f = fadeRef.current
    if (group.current) group.current.visible = f > 0.01
    if (mat.current) mat.current.opacity = f * 0.95
    if (playMat.current) playMat.current.opacity = f * 0.75
  })

  const h = w / 1.777
  const map = assets && (playing || !poster) ? assets.tex : poster
  return (
    <group ref={group} position={position}>
      {map && (
        <mesh
          onPointerUp={(e) => {
            if (input.dragDistance > TAP_SLOP) return
            const a = assetsRef.current
            if (!a) return
            e.stopPropagation()
            if (playing) {
              a.video.pause()
              setPlaying(false)
            } else {
              a.video.play().then(() => setPlaying(true)).catch(() => {})
            }
          }}
        >
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial ref={mat} map={map} transparent opacity={0} toneMapped={false} />
        </mesh>
      )}

      <TileChrome w={w} h={h} accent={accent} fadeRef={fadeRef} />

      {!playing && (
        <mesh position={[0, 0, 0.05]}>
          <circleGeometry args={[Math.min(w, h) * 0.13, 32]} />
          <meshBasicMaterial ref={playMat} color="#dff2ff" transparent opacity={0} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}
