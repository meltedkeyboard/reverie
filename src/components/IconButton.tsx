import { Icon } from '@/components/Icon'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'

import { isDesktop } from '@/lib/platform'
import { PRESS_ANYWHERE } from '@/lib/press'
import { useColors } from '@/theme'

type Props = {
  name: React.ComponentProps<typeof Icon>['name']
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
      // On the desktop a flat square that greys under the pointer.
      style={(state) => [
        isDesktop
          ? [
              { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
              (state as { hovered?: boolean }).hovered && { backgroundColor: colors.surfaceRaised },
              state.pressed && { backgroundColor: colors.border },
            ]
          : [
              { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
              state.pressed && { opacity: 0.55, transform: [{ scale: 0.92 }] },
            ],
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      {children ?? (
        <Icon
          name={name}
          size={isDesktop ? Math.min(size, 18) : size}
          color={color ?? (isDesktop ? colors.textMuted : colors.text)}
        />
      )}
    </Pressable>
  )
}
