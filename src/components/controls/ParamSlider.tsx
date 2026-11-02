import { Slider } from './Slider'
import { Platform, StyleSheet, Text, View } from 'react-native'

import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

type Props = {
  label: string
  value: number
  min: number
  max: number
  step: number
  digits?: number
  // Overrides the plain number display, e.g. to spell out a sentinel value like "off".
  formatValue?: (value: number) => string
  onChange: (value: number) => void
  onSlidingStart?: () => void
  onSlidingComplete?: (value: number) => void
  tintColor?: string
}

export function ParamSlider({ label, value, min, max, step, digits = 0, formatValue, onChange, onSlidingStart, onSlidingComplete, tintColor }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, tintColor ? { color: tintColor } : null]}>
          {formatValue ? formatValue(value) : value.toFixed(digits)}
        </Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onSlidingStart={onSlidingStart}
        onValueChange={onChange}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor={tintColor ?? colors.accent}
        maximumTrackTintColor={colors.borderStrong}
        thumbTintColor={ON_ACCENT}
        style={styles.slider}
      />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    wrap: { marginBottom: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    label: Platform.select({
      android: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '500',
        letterSpacing: 0.2,
      },
      default: {
        color: colors.textFaint,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
      },
    }),
    value: Platform.select({
      android: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '500',
        fontVariant: ['tabular-nums'],
      },
      default: {
        color: colors.text,
        fontSize: 13,
        fontVariant: ['tabular-nums'],
      },
    }),
    slider: Platform.select({
      android: { height: 40, marginHorizontal: 8 },
      default: { height: 36, marginHorizontal: 14 },
    }),
  })
