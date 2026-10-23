import { useRouter } from 'expo-router'
import { useEffect, useId, useRef, useSyncExternalStore, type RefObject } from 'react'
import { Dimensions, Keyboard, Pressable, type StyleProp, type View, type ViewStyle } from 'react-native'

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

type GroupMember = { id: string; node: RefObject<View | null>; image: ViewerImage; corners: Corners }

// Pictures shown together, as those of one message, which the viewer swipes through from the
// one tapped. Each link of the group puts itself in at its place.
export type ImageGroup = { current: (GroupMember | undefined)[] }

export function useImageGroup(): ImageGroup {
  return useRef<(GroupMember | undefined)[]>([])
}

type Props = (
  | {
      uri: string
      // Width over height, so the picture lands exactly where the viewer shows it.
      aspect?: number
      // The file of a stored avatar, whose original the viewer offers in its place.
      avatar?: string | null
      // The pictures this one is swiped through with, and its place among them.
      group?: ImageGroup
      index?: number
      gallery?: never
      spots?: never
    }
  // Several pictures to swipe through, e.g. a room's cast, and where each of them sits given
  // the link's own place on the screen (null for one not shown), to grow out of and go back to.
  | {
      gallery: ViewerImage[]
      spots?: (box: Box) => (ViewerOrigin | null)[]
      uri?: never
      aspect?: never
      avatar?: never
      group?: never
      index?: never
    }
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
export function ImageLink({
  uri,
  aspect = 1,
  avatar,
  group,
  index = 0,
  gallery,
  spots,
  corners = 0,
  onLongPress,
  delayLongPress,
  accessibilityLabel,
  style,
  children,
}: Props) {
  const openViewer = useOpenViewer()
  const self = useRef<View>(null)
  const id = useId()
  // Away while its picture is up in the viewer, which puts it back here on closing.
  const lifted = useLifted(id)
  const image = uri ? { uri, aspect, avatar } : null
  useEffect(() => {
    if (!group || !image) return
    group.current[index] = { id, node: self, image, corners }
    return () => {
      if (group.current[index]?.id === id) group.current[index] = undefined
    }
  })
  const open = () => {
    const node = self.current
    if (gallery) {
      if (!spots || !node) return openViewer(gallery)
      return node.measureInWindow((x, y, width, height) => openViewer(gallery, 0, spots({ x, y, width, height })))
    }
    const members = group?.current.filter((member): member is GroupMember => !!member) ?? []
    if (members.length > 1) {
      // Each measured as this one is tapped, so whichever picture is shown on closing lands
      // back in its own thumbnail; one scrolled out of sight has no place to land in.
      Promise.all(members.map((member) => placeOf(member.node.current, member.corners))).then((origins) => {
        const start = Math.max(0, members.findIndex((member) => member.id === id))
        openViewer(
          members.map((member) => member.image),
          start,
          origins,
          members.map((member, i) => (origins[i] ? member.id : null))
        )
      })
      return
    }
    if (!image) return
    if (!node) return openViewer([image])
    // Measured as it is tapped, so the picture grows out of where it is now.
    placeOf(node, corners).then((origin) => openViewer([image], 0, origin ? [origin] : [], [id]))
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

// Where a thumbnail sits in the window, or null for one off the screen.
function placeOf(node: View | null, corners: Corners) {
  return new Promise<ViewerOrigin | null>((resolve) => {
    if (!node) return resolve(null)
    node.measureInWindow((x, y, width, height) => {
      const window = Dimensions.get('window')
      const shown = width > 0 && height > 0 && x + width > 0 && y + height > 0 && x < window.width && y < window.height
      resolve(shown ? originOf({ x, y, width, height }, corners) : null)
    })
  })
}

// Whether the thumbnail `source` stands for is up in the viewer, and so hides.
export function useLifted(source: string) {
  return useSyncExternalStore(subscribeLifted, () => liftedSource() === source, () => false)
}

// A second open while the viewer is still coming up, as from a double tap on a thumbnail,
// would stack another one on it.
let lastOpen = 0

// For places where the picture can't be its own button, like an item in a menu. `origins`
// are where the pictures sit, and `sources` the thumbnails that hide while their pictures are up.
export function useOpenViewer() {
  const router = useRouter()
  return (images: ViewerImage[], index = 0, origins: (ViewerOrigin | null)[] = [], sources: (string | null)[] = []) => {
    if (!images.length || Date.now() - lastOpen < 400) return
    lastOpen = Date.now()
    // The keyboard would stay up over the picture.
    Keyboard.dismiss()
    setViewerImages(images, index, origins, sources)
    router.push('/viewer')
  }
}
