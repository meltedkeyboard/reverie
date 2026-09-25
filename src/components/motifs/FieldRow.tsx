import { useState } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'

import { useInputColors } from '@/components/Field'
import { useColors, useStyles, type Colors } from '@/theme'

import { Star } from './Star'

type Props = Pick<
  TextInputProps,
  'value' | 'onChangeText' | 'placeholder' | 'secureTextEntry' | 'keyboardType' | 'autoCapitalize' | 'autoCorrect' | 'multiline'
> & {
  label?: string
  hint?: string
  minHeight?: number
  star?: boolean
}

// A caps label with a tiny star mark, a plain value on a hairline rule (no box), and an
// optional helper line below.
export function FieldRow({ label, hint, minHeight, multiline, star = true, ...input }: Props) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const inputColors = useInputColors()
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.fieldWrap}>
      {label ? (
        <View style={styles.fieldLabelRow}>
          {star ? <Star size={9} color={colors.accent} rotation={10} /> : null}
          <Text style={styles.fieldLabel}>{label}</Text>
        </View>
      ) : null}
      <View style={[styles.box, focused && { borderColor: colors.accent }]}>
        <TextInput
          {...inputColors}
          {...input}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.fieldInput, multiline && { minHeight: minHeight ?? 90, textAlignVertical: 'top' }]}
        />
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    fieldWrap: { marginBottom: 22 },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    fieldLabel: { color: colors.textFaint, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    box: {
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    fieldInput: { color: colors.text, fontSize: 16, paddingVertical: 12, paddingHorizontal: 14 },
    fieldHint: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: 8 },
  })
