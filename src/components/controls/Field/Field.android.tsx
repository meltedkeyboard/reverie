import { useState } from 'react'
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

export function Field({ label, hint, style, multiline, onFocus, onBlur, ...input }: FieldProps) {
  const styles = useStyles(createStyles)
  const inputColors = useInputColors()
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text> : null}
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
        style={[
          styles.input,
          focused ? styles.inputFocused : styles.inputUnfocused,
          multiline && styles.multiline,
          style,
        ]}
      />
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    wrap: { marginBottom: 20 },
    label: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 6,
      marginLeft: 4,
      letterSpacing: 0.1,
    },
    labelFocused: {
      color: colors.accent,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      color: colors.text,
      fontSize: 16,
      paddingHorizontal: 16,
      height: 54,
      paddingVertical: 0,
    },
    inputUnfocused: {
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 0,
    },
    inputFocused: {
      borderWidth: 2,
      borderColor: colors.accent,
      elevation: 1,
    },
    multiline: {
      height: undefined,
      minHeight: 120,
      paddingTop: 14,
      paddingBottom: 14,
      textAlignVertical: 'top',
    },
    hint: {
      color: colors.textFaint,
      fontSize: 12,
      marginTop: 6,
      marginLeft: 4,
      lineHeight: 16,
    },
  })
