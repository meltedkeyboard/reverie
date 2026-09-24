import { Link, useRouter } from 'expo-router'
import { Platform, Pressable } from 'react-native'

import { setViewerImage } from '@/lib/viewer'

type Props = {
  uri: string
  // Width over height, so the picture lands exactly where the viewer shows it.
  aspect?: number
  onLongPress?: () => void
  delayLongPress?: number
  accessibilityLabel?: string
  children: React.ReactNode
}

// A picture that opens full screen. On iOS the viewer zooms out of the picture itself
// and shrinks back into it on the way out.
export function ImageLink({ uri, aspect = 1, onLongPress, delayLongPress, accessibilityLabel, children }: Props) {
  const router = useRouter()
  const open = () => setViewerImage({ uri, aspect })
  const push = () => {
    open()
    router.push('/viewer')
  }
  const pressable = (
    <Pressable
      // On iOS the Link around it navigates.
      onPress={Platform.OS === 'ios' ? undefined : push}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => pressed && { opacity: 0.8 }}
    >
      {children}
    </Pressable>
  )
  // On web a Link turns the Pressable into a real anchor whose click reloads the page,
  // losing the picture kept in memory; the zoom exists only on iOS anyway.
  if (Platform.OS !== 'ios') return pressable
  return (
    <Link href="/viewer" onPress={open} asChild>
      <Link.AppleZoom>{pressable}</Link.AppleZoom>
    </Link>
  )
}
