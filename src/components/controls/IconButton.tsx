import { Icon } from '@/components/visuals/Icon'
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

import { isAndroid, isDesktop } from '@/lib/core/platform'
import { PRESS_ANYWHERE } from '@/lib/ui/press'
import { type Colors, useColors, useStyles } from '@/theme'

type Props = {
  name: React.ComponentProps<typeof Icon>['name']
  // Optional because a Link with asChild injects its own onPress.
  onPress?: () => void
  onPressIn?: () => void
  onPressOut?: () => void
  size?: number
  color?: string
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  accessibilityLabel?: string
  // Replaces the Ionicons glyph, e.g. with an animated SF Symbol.
  children?: React.ReactNode
}

export function IconButton({ name, onPress, onPressIn, onPressOut, size = 22, color, style, disabled, accessibilityLabel, children }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = color ?? (isDesktop ? colors.textMuted : colors.text)

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      pressRetentionOffset={PRESS_ANYWHERE}
      android_ripple={{
        color: `${tint}20`,
        borderless: true,
        radius: 20,
      }}
      style={(state) => [
        styles.button,
        isDesktop && (state as { hovered?: boolean }).hovered && styles.hovered,
        isDesktop && state.pressed && styles.pressedDesktop,
        !isDesktop && !isAndroid && state.pressed && styles.pressedIOS,
        disabled && styles.disabled,
        style,
      ]}
    >
      {children ?? (
        <Icon
          name={name}
          size={isDesktop ? Math.min(size, 18) : size}
          color={tint}
        />
      )}
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    button: Platform.select({
      ios: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
      android: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
      default: isDesktop
        ? { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 }
        : { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
    }),
    pressedIOS: { opacity: 0.55, transform: [{ scale: 0.92 }] },
    pressedDesktop: { backgroundColor: colors.border },
    hovered: { backgroundColor: colors.surfaceRaised },
    disabled: Platform.select({
      android: { opacity: 0.38 },
      default: { opacity: 0.35 },
    }),
  })
