import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native'

import { useStyles, useTheme, type Colors } from '@/theme'

type Props = TextInputProps & {
  label?: string
  hint?: string
}

// The colors every text input in the app takes from the theme.
export function useInputColors() {
  const { colors, scheme } = useTheme()
  return { placeholderTextColor: colors.textFaint, selectionColor: colors.accent, keyboardAppearance: scheme }
}

export function FieldLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const styles = useStyles(createStyles)
  return <Text style={[styles.label, style]}>{children}</Text>
}

export function FieldHint({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const styles = useStyles(createStyles)
  return <Text style={[styles.hint, style]}>{children}</Text>
}

// A box with a hairline, as in the first releases.
export function Field({ label, hint, style, multiline, ...input }: Props) {
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
    // Several lines: no set height, the padding comes back.
    multiline: { height: undefined, minHeight: 132, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
    hint: { color: colors.textFaint, fontSize: 12, marginTop: 6, marginLeft: 4, lineHeight: 17 },
  })
