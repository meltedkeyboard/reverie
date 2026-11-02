import { Icon } from '@/components/visuals/Icon'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { liquidGlass } from '@/lib/ui/nativeUI'
import { isDesktop } from '@/lib/core/platform'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { GlassSurface } from '../../chrome/Glass'
import { SFIcon } from '../../visuals/SFIcon'
import { SlidingIcon, useAtLeastOneLap } from './animation'
import type { PillButtonProps } from './types'

export { useAtLeastOneLap, SlidingIcon }

export function PillButton({ label, accessibilityLabel, icon, onPress, color, filled = false, flat = false, disabled, loading, style }: PillButtonProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = color ?? colors.accent
  const ink = filled ? ON_ACCENT : tint
  const sliding = useAtLeastOneLap(!!loading && !!icon?.slide)
  const inactive = disabled || loading || sliding
  const glass = !!liquidGlass && !flat
  const shape = [styles.pill, !label && styles.circle]
  const fill = filled ? { backgroundColor: tint } : styles.solid

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [style, inactive && !sliding && { opacity: 0.5 }, !glass && !isDesktop && pressed && { transform: [{ scale: 0.97 }] }, isDesktop && pressed && { opacity: 0.8 }]}
    >
      <Surface flat={flat} interactive={!inactive} tintColor={filled ? tint : undefined} style={shape} fill={fill}>
        {loading && !sliding ? (
          <ActivityIndicator color={ink} />
        ) : (
          <View style={styles.content}>
            {icon ? (
              <SlidingIcon direction={icon.slide} active={sliding}>
                {icon.plain ? (
                  <Icon name={icon.fallback} size={19} color={ink} />
                ) : (
                  <SFIcon name={icon.name} fallback={icon.fallback} size={19} color={filled ? ink : color ?? colors.text} onAccent={filled} />
                )}
              </SlidingIcon>
            ) : null}
            {label ? (
              <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, { color: ink }]} numberOfLines={1}>
                {label}
              </Text>
            ) : null}
          </View>
        )}
      </Surface>
    </Pressable>
  )
}

function Surface({
  flat,
  interactive,
  tintColor,
  style,
  fill,
  children,
}: {
  flat: boolean
  interactive: boolean
  tintColor?: string
  style: StyleProp<ViewStyle>
  fill: StyleProp<ViewStyle>
  children: ReactNode
}) {
  if (flat) return <View style={[style, fill]}>{children}</View>
  return (
    <GlassSurface interactive={interactive} tintColor={tintColor} style={style} fallbackStyle={fill}>
      {children}
    </GlassSurface>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    pill: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    circle: { width: 44, paddingHorizontal: 0 },
    solid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { fontSize: 16, fontWeight: '600' },
  })
