import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'

import { PRESS_ANYWHERE } from '@/lib/press'
import { useColors } from '@/theme'

type Props = {
  name: React.ComponentProps<typeof Ionicons>['name']
  // Optional because a Link with asChild injects its own onPress.
  onPress?: () => void
  size?: number
  color?: string
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  accessibilityLabel?: string
  // Replaces the Ionicons glyph, e.g. with an animated SF Symbol.
  children?: React.ReactNode
}

export function IconButton({ name, onPress, size = 22, color, style, disabled, accessibilityLabel, children }: Props) {
  const colors = useColors()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      pressRetentionOffset={PRESS_ANYWHERE}
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
