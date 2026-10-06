import { Text, View } from 'react-native'

import { avatarUri } from '@/lib/images/avatars'
import { fonts } from '@/theme'

import { ImageLink } from './ImageLink'
import { Picture } from './Picture'

const TINTS = ['#3B2F5C', '#2F4A5C', '#5C3B47', '#365C48', '#5C4F2F', '#40406B']

type Props = {
  name: string
  file?: string | null
  uri?: string | null
  size: number
  // Square corners, for an avatar that fills the edge of a card clipping it.
  square?: boolean
  // Fills the box it is put in instead of a size × size square; `size` still sets the
  // initial's size.
  fill?: boolean
  // A tap opens the photo full screen. Off where the avatar sits inside a control
  // that owns the tap itself, like a menu trigger or a swipeable button.
  viewable?: boolean
}

export function Avatar({ name, file, uri, size, square = false, fill = false, viewable = true }: Props) {
  const source = uri ?? (file ? avatarUri(file) : null)
  const box = fill
    ? { flex: 1, borderRadius: square ? 0 : size / 2, overflow: 'hidden' as const }
    : { width: size, height: size, borderRadius: square ? 0 : size / 2, overflow: 'hidden' as const }

  if (source) {
    const image = <Picture uri={source} style={box} transition={150} />
    if (!viewable) return image
    return (
      <ImageLink uri={source} accessibilityLabel={name} style={fill ? { flex: 1 } : undefined}>
        {image}
      </ImageLink>
    )
  }

  const tint = TINTS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TINTS.length]
  return (
    <View style={[box, { backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: fonts.prose, fontSize: size * 0.42 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  )
}
