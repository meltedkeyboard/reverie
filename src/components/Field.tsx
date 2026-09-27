import { useState } from 'react'
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native'

import { liquidGlass } from '@/lib/nativeUI'
import { useStyles, useTheme, type Colors } from '@/theme'

import { GlassSurface } from './Glass'

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

// A one-line field is a Liquid Glass capsule on iOS 26, tinted while it has focus; a
// multiline one, and every field without Liquid Glass, is a box with a hairline.
export function Field({ label, hint, style, multiline, onFocus, onBlur, ...input }: Props) {
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const inputColors = useInputColors()
  const [focused, setFocused] = useState(false)
  const glass = liquidGlass && !multiline
  const textInput = (
    <TextInput
      {...input}
      {...inputColors}
      multiline={multiline}
      onFocus={(e) => {
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        onBlur?.(e)
      }}
      style={[styles.input, glass && styles.glassInput, multiline && styles.multiline, style]}
    />
  )
  return (
    <View style={styles.wrap}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {glass ? (
        <GlassSurface variant="clear" tintColor={focused ? colors.accentSoft : undefined} style={styles.glassBox}>
          {textInput}
        </GlassSurface>
      ) : (
        textInput
      )}
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
      paddingTop: 13,
      paddingBottom: 13,
    },
    glassBox: { borderRadius: 23, borderCurve: 'continuous' },
    // The glass is the box, so the input itself goes clear and borderless.
    glassInput: { backgroundColor: 'transparent', borderWidth: 0, minHeight: 46, paddingHorizontal: 18 },
    multiline: { minHeight: 132, textAlignVertical: 'top' },
    hint: { color: colors.textFaint, fontSize: 12, marginTop: 6, marginLeft: 4, lineHeight: 17 },
  })
