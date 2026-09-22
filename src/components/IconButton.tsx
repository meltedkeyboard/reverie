import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'

import { useColors } from '@/theme'

type Props = {
  name: React.ComponentProps<typeof Ionicons>['name']
  // Optional because a Link with asChild injects its own onPress.
  onPress?: () => void
  size?: number
  color?: string
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  // Replaces the Ionicons glyph, e.g. with an animated SF Symbol.
  children?: React.ReactNode
}

export function IconButton({ name, onPress, size = 22, color, style, disabled, children }: Props) {
  const colors = useColors()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
        pressed && { opacity: 0.55, transform: [{ scale: 0.92 }] },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      {children ?? <Ionicons name={name} size={size} color={color ?? colors.text} />}
    </Pressable>
  )
}
