import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { useColors, useStyles, type Colors } from '@/theme'

import { IconButton } from '../controls/IconButton'

type Props = {
  index: number
  count: number
  onChange: (index: number) => void
  disabled?: boolean
  // What sits between the arrows; "2 / 5" when not given.
  label?: string
  style?: StyleProp<ViewStyle>
}

// Arrows to step through the versions of something, with where you are between them.
export function Pager({ index, count, onChange, disabled, label, style }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.pager, style]}>
      <IconButton
        name="chevron-back"
        size={16}
        color={colors.textMuted}
        disabled={disabled || index === 0}
        onPress={() => onChange(index - 1)}
        style={styles.button}
      />
      <Text style={styles.text}>{label ?? `${index + 1} / ${count}`}</Text>
      <IconButton
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
        disabled={disabled || index === count - 1}
        onPress={() => onChange(index + 1)}
        style={styles.button}
      />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    pager: { flexDirection: 'row', alignItems: 'center' },
    button: { width: 28, height: 32 },
    text: { color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'center' },
  })
