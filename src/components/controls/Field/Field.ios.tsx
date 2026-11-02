import { StyleSheet, Text, TextInput, View } from 'react-native'

import { useStyles, useTheme, type Colors } from '@/theme'
import type { FieldHintProps, FieldLabelProps, FieldProps } from './types'

export function useInputColors() {
  const { colors, scheme } = useTheme()
  return { placeholderTextColor: colors.textFaint, selectionColor: colors.accent, keyboardAppearance: scheme }
}

export function FieldLabel({ children, style }: FieldLabelProps) {
  const styles = useStyles(createStyles)
  return <Text style={[styles.label, style]}>{children}</Text>
}

export function FieldHint({ children, style }: FieldHintProps) {
  const styles = useStyles(createStyles)
  return <Text style={[styles.hint, style]}>{children}</Text>
}

export function Field({ label, hint, style, multiline, ...input }: FieldProps) {
  const styles = useStyles(createStyles)
  const inputColors = useInputColors()
  return (
    <View style={styles.wrap}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TextInput {...input} {...inputColors} multiline={multiline} style={[styles.input, multiline && styles.multiline, style]} />
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    wrap: { marginBottom: 20 },
    label: { color: colors.textMuted, fontSize: 13, marginBottom: 8, marginLeft: 4 },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      color: colors.text,
      fontSize: 16,
      paddingHorizontal: 14,
      height: 48,
      paddingVertical: 0,
    },
    multiline: { height: undefined, minHeight: 132, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
    hint: { color: colors.textFaint, fontSize: 12, marginTop: 6, marginLeft: 4, lineHeight: 17 },
  })
