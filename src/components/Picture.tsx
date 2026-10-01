import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import type { ImageStyle, StyleProp } from 'react-native'

import { isVideo } from '@/lib/media'

type Props = {
  uri: string
  style?: StyleProp<ImageStyle>
  contentFit?: 'cover' | 'contain'
  // A fade-in for a still picture; a video has none.
  transition?: number
}

// A picture by its file: expo-image for stills and the GIF, WebP and APNG that move, a
// looping muted player for MP4, MOV and M4V.
export function Picture({ uri, style, contentFit = 'cover', transition }: Props) {
  if (isVideo(uri)) return <LoopingVideo uri={uri} style={style} contentFit={contentFit} />
  return <Image source={{ uri }} style={style} contentFit={contentFit} transition={transition} />
}

function LoopingVideo({ uri, style, contentFit }: Required<Pick<Props, 'uri' | 'contentFit'>> & Pick<Props, 'style'>) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.muted = true
    // A silent avatar must not pause the user's music.
    p.audioMixingMode = 'mixWithOthers'
    p.play()
  })
  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  )
}
