import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useRef } from 'react'
import { AppState, type ImageStyle, type StyleProp } from 'react-native'

import { isVideo } from '@/lib/images/media'

type Props = {
  uri: string
  style?: StyleProp<ImageStyle>
  contentFit?: 'cover' | 'contain'
  // A fade-in for a still picture; a video has none.
  transition?: number
  // Holds a moving picture on its frame and a video where it is.
  paused?: boolean
  // The size of a video as shown, its rotation applied, once its file has loaded.
  onVideoSize?: (size: { width: number; height: number }) => void
}

// A picture by its file: expo-image for stills and the GIF, WebP and APNG that move, a
// looping muted player for MP4, MOV and M4V.
export function Picture({ uri, style, contentFit = 'cover', transition, paused = false, onVideoSize }: Props) {
  const image = useRef<Image>(null)
  const wasPaused = useRef(paused)
  // `autoplay` is only read as a picture is set, so a later change goes through the view,
  // and only a change: on mount the native view may not be found yet.
  useEffect(() => {
    if (wasPaused.current === paused) return
    wasPaused.current = paused
    const change = paused ? image.current?.stopAnimating() : image.current?.startAnimating()
    // A recycled or departed view has nothing to stop or start.
    change?.catch(() => {})
  }, [paused])
  if (isVideo(uri)) return <LoopingVideo uri={uri} style={style} contentFit={contentFit} paused={paused} onVideoSize={onVideoSize} />
  return <Image ref={image} source={{ uri }} style={style} contentFit={contentFit} transition={transition} autoplay={!paused} />
}

function LoopingVideo({ uri, style, contentFit, paused, onVideoSize }: Required<Pick<Props, 'uri' | 'contentFit' | 'paused'>> & Pick<Props, 'style' | 'onVideoSize'>) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.muted = true
    // A silent avatar must not pause the user's music.
    p.audioMixingMode = 'mixWithOthers'
  })
  // A player that was never started may show no frame at all, so a paused one still plays
  // up to its first frame and stops there.
  const shown = useRef(false)
  const pausedNow = useRef(paused)
  pausedNow.current = paused
  useEffect(() => {
    if (paused && shown.current) {
      player.pause()
      return
    }
    player.play()
    if (paused) return
    // The system stops the player while the app is away and need not start it again.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') player.play()
    })
    return () => sub.remove()
  }, [player, paused])
  // A track's size leaves out its rotation, so a phone's upright video would read as lying
  // down; the first frame is taken with it, and the track's size is only a fallback.
  useEffect(() => {
    if (!onVideoSize) return
    const measure = () => {
      const track = player.availableVideoTracks[0]?.size
      player
        .generateThumbnailsAsync(0)
        .then(([frame]) => (frame ? { width: frame.width, height: frame.height } : track))
        .catch(() => track)
        .then((size) => {
          if (size?.width && size.height) onVideoSize(size)
        })
    }
    if (player.status === 'readyToPlay') measure()
    const sub = player.addListener('sourceLoad', measure)
    return () => sub.remove()
  }, [player, onVideoSize])
  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={false}
      allowsPictureInPicture={false}
      onFirstFrameRender={() => {
        shown.current = true
        if (pausedNow.current) player.pause()
      }}
    />
  )
}
