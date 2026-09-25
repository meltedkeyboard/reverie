import { useRouter } from 'expo-router'
import { Pressable } from 'react-native'

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

// A picture that opens full screen in the viewer.
export function ImageLink({ uri, aspect = 1, onLongPress, delayLongPress, accessibilityLabel, children }: Props) {
  const router = useRouter()
  const push = () => {
    setViewerImage({ uri, aspect })
    router.push('/viewer')
  }
  return (
    <Pressable
      onPress={push}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => pressed && { opacity: 0.8 }}
    >
      {children}
    </Pressable>
  )
}
