import { useMemo } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'

import { useTheme } from '@/theme'

type Props = TextInputProps & {
  label: string
  hint?: string
}

export function Field({ label, hint, style, multiline, ...input }: Props) {
  const { colors, scheme } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        multiline={multiline}
        placeholderTextColor={colors.textFaint}
        keyboardAppearance={scheme}
        selectionColor={colors.accent}
        style={[styles.input, multiline && styles.multiline, style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
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
    paddingTop: 13,
    paddingBottom: 13,
  },
  multiline: { minHeight: 132, textAlignVertical: 'top' },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: 6, marginLeft: 4, lineHeight: 17 },
})
