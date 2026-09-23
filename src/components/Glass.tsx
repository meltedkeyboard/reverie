import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps } from 'react'
import { useMemo } from 'react'
import { Pressable, StyleSheet, View, type ColorValue, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'

import { glassEffect, liquidGlass } from '@/lib/nativeUI'
import { useTheme } from '@/theme'

import { IconButton } from './IconButton'

type SurfaceProps = ViewProps & {
  // Applied only when Liquid Glass is unavailable, in place of the glass material.
  fallbackStyle?: StyleProp<ViewStyle>
  interactive?: boolean
  tintColor?: ColorValue
}

export function GlassSurface({ style, fallbackStyle, interactive, tintColor, children, ...rest }: SurfaceProps) {
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
      glassEffectStyle="regular"
      colorScheme={scheme}
      isInteractive={interactive}
      tintColor={tintColor}
      style={style}
      {...rest}
    >
      {children}
    </GlassView>
  )
}

type ButtonProps = {
  icon: ComponentProps<typeof Ionicons>['name']
  iconSize?: number
  // Optional because a Link with asChild injects its own onPress.
  onPress?: () => void
  disabled?: boolean
  // Replaces the Ionicons glyph, e.g. with an animated SF Symbol.
  children?: React.ReactNode
}

// A round Liquid Glass button of the same 44 pt as the other glass controls; outside
// iOS 26 it is the plain icon button.
export function GlassButton({ icon, iconSize = 22, onPress, disabled = false, children }: ButtonProps) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  if (!liquidGlass) {
    return (
      <IconButton name={icon} size={iconSize} onPress={onPress} disabled={disabled}>
        {children}
      </IconButton>
    )
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => pressed && { transform: [{ scale: 0.94 }] }}
    >
      <GlassSurface interactive style={styles.circle}>
        {children ?? <Ionicons name={icon} size={iconSize - 2} color={colors.text} />}
      </GlassSurface>
    </Pressable>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  })
