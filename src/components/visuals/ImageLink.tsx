import { useRouter } from 'expo-router'
import { useId, useRef, useSyncExternalStore } from 'react'
import { Keyboard, Pressable, type StyleProp, type View, type ViewStyle } from 'react-native'

import { PRESS_ANYWHERE } from '@/lib/ui/press'
import {
  liftedSource,
  originOf,
  setViewerImages,
  subscribeLifted,
  type Corners,
  type ViewerImage,
  type ViewerOrigin,
} from '@/lib/images/viewer'

type Box = { x: number; y: number; width: number; height: number }

type Props = (
  | {
      uri: string
      // Width over height, so the picture lands exactly where the viewer shows it.
      aspect?: number
      // The file of a stored avatar, whose original the viewer offers in its place.
      avatar?: string | null
      gallery?: never
      spots?: never
    }
  // Several pictures to swipe through, e.g. a room's cast, and where each of them sits given
  // the link's own place on the screen (null for one not shown), to grow out of and go back to.
  | { gallery: ViewerImage[]; spots?: (box: Box) => (ViewerOrigin | null)[]; uri?: never; aspect?: never; avatar?: never }
) & {
  // The corners of the picture as shown (half the side of a round avatar), which the viewer
  // grows it out of and puts it back into.
  corners?: Corners
  onLongPress?: () => void
  delayLongPress?: number
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

// A picture that opens full screen in the viewer, growing out of its place.
export function ImageLink({ uri, aspect = 1, avatar, gallery, spots, corners = 0, onLongPress, delayLongPress, accessibilityLabel, style, children }: Props) {
  const openViewer = useOpenViewer()
  const self = useRef<View>(null)
  const id = useId()
  // Away while its picture is up in the viewer, which puts it back here on closing.
  const lifted = useLifted(id)
  const open = () => {
    const node = self.current
    if (gallery) {
      if (!spots || !node) return openViewer(gallery)
      return node.measureInWindow((x, y, width, height) => openViewer(gallery, 0, spots({ x, y, width, height })))
    }
    const image = { uri: uri!, aspect, avatar }
    if (!node) return openViewer([image])
    // Measured as it is tapped, so the picture grows out of where it is now.
    node.measureInWindow((x, y, width, height) => {
      openViewer([image], 0, width > 0 && height > 0 ? [originOf({ x, y, width, height }, corners)] : [], id)
    })
  }
  return (
    <Pressable
      ref={self}
      onPress={open}
      onLongPress={onLongPress}
      pressRetentionOffset={PRESS_ANYWHERE}
      delayLongPress={delayLongPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [style, pressed && { opacity: 0.8 }, lifted && { opacity: 0 }]}
    >
      {children}
    </Pressable>
  )
}

// Whether the thumbnail `source` stands for is up in the viewer, and so hides.
export function useLifted(source: string) {
  return useSyncExternalStore(subscribeLifted, () => liftedSource() === source, () => false)
}

// A second open while the viewer is still coming up, as from a double tap on a thumbnail,
// would stack another one on it.
let lastOpen = 0

// For places where the picture can't be its own button, like an item in a menu. `origins`
// are where the pictures sit, and `source` the thumbnail that hides while its picture is up.
export function useOpenViewer() {
  const router = useRouter()
  return (images: ViewerImage[], index = 0, origins: (ViewerOrigin | null)[] = [], source: string | null = null) => {
    if (!images.length || Date.now() - lastOpen < 400) return
    lastOpen = Date.now()
    // The keyboard would stay up over the picture.
    Keyboard.dismiss()
    setViewerImages(images, index, origins, source)
    router.push('/viewer')
  }
}
