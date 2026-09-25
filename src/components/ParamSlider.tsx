import Slider from '@react-native-community/slider'
import { StyleSheet, Text, View } from 'react-native'

import { useColors, useStyles, type Colors } from '@/theme'

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
}

export function ParamSlider({ label, value, min, max, step, digits = 0, formatValue, onChange }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{formatValue ? formatValue(value) : value.toFixed(digits)}</Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={onChange}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.borderStrong}
        thumbTintColor="#FFFFFF"
        style={styles.slider}
      />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  wrap: { marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.textFaint, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  value: { color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] },
  slider: { height: 36, marginHorizontal: 14 },
})
