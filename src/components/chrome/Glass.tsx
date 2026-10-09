import { Icon } from '@/components/visuals/Icon'
import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, View, type ColorValue, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'

import { floatingBars, glassEffect, liquidGlass } from '@/lib/ui/nativeUI'
import { isDesktop } from '@/lib/core/platform'
import { useStyles, useTheme, type Colors } from '@/theme'

import { IconButton } from '../controls/IconButton'

type SurfaceProps = ViewProps & {
  // Applied only when Liquid Glass is unavailable, in place of the glass material.
  fallbackStyle?: StyleProp<ViewStyle>
  interactive?: boolean
  tintColor?: ColorValue
  // 'clear' is the see-through variant, with barely any frost of its own.
  variant?: 'regular' | 'clear'
}

// Glass pieces that melt into one another when they come close, as when an interactive
// one is pulled towards its neighbour; on its own each piece is drawn apart. A plain view
// without Liquid Glass.
export function GlassMerge({ spacing = 8, ...props }: ViewProps & { spacing?: number }) {
  if (!glassEffect) return <View {...props} />
  return <glassEffect.GlassContainer spacing={spacing} {...props} />
}

export function GlassSurface({ style, fallbackStyle, interactive, tintColor, variant = 'regular', children, ...rest }: SurfaceProps) {
  const { scheme } = useTheme()
  if (!glassEffect) {
    return (
      <View style={[style, fallbackStyle]} {...rest}>
        {children}
      </View>
    )
  }
  const { GlassView } = glassEffect
  return (
    <GlassView
      glassEffectStyle={variant}
      colorScheme={scheme}
      isInteractive={interactive ?? false}
      tintColor={tintColor}
      style={style}
      {...rest}
    >
      {children}
    </GlassView>
  )
}

type ButtonProps = {
  icon: ComponentProps<typeof Icon>['name']
  iconSize?: number
  // Optional because a Link with asChild injects its own onPress.
  onPress?: () => void
  // For an action that answers the touch itself, not its end.
  onPressIn?: () => void
  onPressOut?: () => void
  disabled?: boolean
  accessibilityLabel?: string
  // Fills the button, for the one action a screen leads to (like saving). A disabled
  // button stays plain glass.
  tint?: string
  // Replaces the Ionicons glyph, e.g. with an animated SF Symbol.
  children?: React.ReactNode
}

// A round Liquid Glass button of the same 44 pt as the other glass controls; outside
// iOS 26 it is the plain icon button. The glass is interactive and springs under the
// finger by itself, so a glass control adds no press scale of its own: the two fight.
export function GlassButton({ icon, iconSize = 22, onPress, onPressIn, onPressOut, disabled = false, accessibilityLabel, tint, children }: ButtonProps) {
  const { colors } = useTheme()
  const styles = useStyles(createStyles)
  const fill = disabled ? undefined : tint
  if (!liquidGlass) {
    return (
      <IconButton
        name={icon}
        size={iconSize}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        style={[floatingBars && !isDesktop && styles.circleSolid, fill ? { backgroundColor: fill } : undefined]}
      >
        {children}
      </IconButton>
    )
  }
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
    >
      <GlassSurface interactive={!disabled} tintColor={fill} style={styles.circle}>
        {/* Like a disabled bar button: the glass stays, only the glyph greys out. */}
        <View style={disabled && styles.disabled}>
          {children ?? <Icon name={icon} size={iconSize - 2} color={colors.text} />}
        </View>
      </GlassSurface>
    </Pressable>
  )
}

// Several icon buttons in one Liquid Glass capsule, the way iOS 26 groups bar items;
// outside iOS 26 they are just the plain icon buttons side by side.
export function GlassGroup({ children }: { children: React.ReactNode }) {
  const styles = useStyles(createStyles)
  // On the desktop the buttons stand loose, flat, as in a toolbar.
  if (isDesktop) return <View style={styles.desktopGroup}>{children}</View>
  return (
    <GlassSurface interactive style={styles.group} fallbackStyle={floatingBars && styles.solid}>
      {children}
    </GlassSurface>
  )
}

// The 44 pt circle of the glass controls, and what a glass surface falls back to
// without Liquid Glass: the plain surface with a hairline.
export function useGlassStyles() {
  return useStyles(createStyles)
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    group: { height: 44, borderRadius: 22, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center' },
    circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    circleSolid: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    solid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    disabled: { opacity: 0.35 },
    desktopGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    // What stands in for glass on the desktop: a flat grey fill, no outline.
    ...(isDesktop ? { solid: { backgroundColor: colors.surfaceRaised, borderWidth: 0 } } : {}),
  })
