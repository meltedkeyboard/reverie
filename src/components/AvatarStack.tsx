import { StyleSheet, Text, View } from 'react-native'

import { avatarUri } from '@/lib/avatars'
import { useStyles, type Colors } from '@/theme'

import { Avatar } from './Avatar'
import { ImageLink } from './ImageLink'

type Props = {
  cast: { name: string; avatar: string | null }[]
  size: number
  // How many faces are drawn before the rest collapse into "+N".
  max?: number
  // A tap opens every member's photo in the viewer, to swipe through. Off where the stack
  // sits inside a control that owns the tap itself.
  viewable?: boolean
}

// A room's members as overlapping avatars, each ringed in the background color so the
// edges stay apart.
export function AvatarStack({ cast, size, max = 3, viewable = true }: Props) {
  const styles = useStyles(createStyles)
  const shown = cast.slice(0, max)
  const rest = cast.length - shown.length
  const ring = Math.max(1.5, size / 18)
  const overlap = size * 0.34
  const stack = (
    <View style={styles.row}>
      {shown.map((member, index) => (
        <View
          key={index}
          style={[
            styles.ring,
            { borderWidth: ring, borderRadius: size, marginLeft: index ? -overlap : 0, zIndex: shown.length - index },
          ]}
        >
          <Avatar name={member.name} file={member.avatar} size={size} viewable={false} />
        </View>
      ))}
      {rest > 0 ? (
        <View
          style={[
            styles.ring,
            styles.more,
            { width: size + ring * 2, height: size + ring * 2, borderWidth: ring, borderRadius: size, marginLeft: -overlap },
          ]}
        >
          <Text style={[styles.moreText, { fontSize: size * 0.36 }]}>+{rest}</Text>
        </View>
      ) : null}
    </View>
  )

  const gallery = viewable ? castGallery(cast) : []
  if (!gallery.length) return stack
  return (
    <ImageLink gallery={gallery} accessibilityLabel={cast.map((m) => m.name).join(', ')}>
      {stack}
    </ImageLink>
  )
}

// Avatars are cropped square when picked, so each is shown as a square.
export function castGallery(cast: { avatar: string | null }[]) {
  return cast.flatMap((m) => {
    const uri = m.avatar ? avatarUri(m.avatar) : null
    return uri ? [{ uri, aspect: 1 }] : []
  })
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center' },
    ring: { borderColor: colors.bg, overflow: 'hidden' },
    more: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
    moreText: { color: colors.textMuted, fontWeight: '600' },
  })
