import { useRouter } from 'expo-router'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'

import { PRESS_ANYWHERE } from '@/lib/press'
import { setViewerImages, type ViewerImage } from '@/lib/viewer'

type Props = (
  | {
      uri: string
      // Width over height, so the picture lands exactly where the viewer shows it.
      aspect?: number
      gallery?: never
    }
  // Several pictures to swipe through, e.g. a room's cast.
  | { gallery: ViewerImage[]; uri?: never; aspect?: never }
) & {
  onLongPress?: () => void
  delayLongPress?: number
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

// A picture that opens full screen in the viewer.
export function ImageLink({ uri, aspect = 1, gallery, onLongPress, delayLongPress, accessibilityLabel, style, children }: Props) {
  const openViewer = useOpenViewer()
  return (
    <Pressable
      onPress={() => openViewer(gallery ?? [{ uri: uri!, aspect }])}
      onLongPress={onLongPress}
      pressRetentionOffset={PRESS_ANYWHERE}
      delayLongPress={delayLongPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}
    >
      {children}
    </Pressable>
  )
}

// For places where the picture can't be its own button, like an item in a menu.
export function useOpenViewer() {
  const router = useRouter()
  return (images: ViewerImage[], index = 0) => {
    if (!images.length) return
    setViewerImages(images, index)
    router.push('/viewer')
  }
}
