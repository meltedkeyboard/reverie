import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'

import { useInputColors } from '@/components/Field'
import type { MenuItem } from '@/components/NativeMenu'
import { PickerBox } from '@/components/PickerBox'
import { SFIcon } from '@/components/SFIcon'
import { useTranslation } from '@/i18n'
import { isDesktop } from '@/lib/platform'
import { setTextDraft } from '@/lib/textDraft'
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
  // The title of the full-screen editor. A multiline field with one is edited only there.
  expandTitle?: string
  // Makes the field a choice instead of an input: the value in a capsule, and a tap
  // opens the system menu with these rows.
  menu?: MenuItem[]
}

const LINE_HEIGHT = 21
// A multiline input keeps this height unless given its own, and scrolls inside.
const AREA_HEIGHT = 110

// A caps label with a tiny star mark, the input, and an optional helper line below.
// The input is a rounded box with a hairline, as in the first releases.
//
// A multiline input has a set height and scrolls inside, so a form of long texts stays
// short enough to see at a glance. With expandTitle the text is only shown there: it
// scrolls, and a tap opens it for editing on the whole screen (app/text-editor.tsx),
// zooming out of the field on iOS.
export function FieldRow({ label, hint, minHeight, multiline, star = true, expandTitle, menu, ...input }: Props) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const inputColors = useInputColors()
  const { t } = useTranslation()
  const [focused, setFocused] = useState(false)
  const expands = !!multiline && !!expandTitle && !!input.onChangeText
  const height = minHeight ?? AREA_HEIGHT

  // Runs before the link navigates, so the editor finds the text waiting.
  const prepareEditor = () => {
    setTextDraft({
      title: expandTitle!,
      value: input.value ?? '',
      placeholder: input.placeholder,
      onChange: input.onChangeText!,
    })
  }

  const frame = (body: React.ReactNode) => (
    <View style={[styles.box, focused && !isDesktop && { borderColor: colors.accent }]}>{body}</View>
  )

  const field = menu ? (
    <PickerBox
      value={input.value ?? ''}
      placeholder={input.placeholder ?? ''}
      items={menu}
      accessibilityLabel={label}
      fallbackStyle={styles.box}
    />
  ) : expands ? (
    <Link href="/text-editor" onPress={prepareEditor} asChild>
      <Link.AppleZoom>
        <Pressable accessibilityRole="button" accessibilityLabel={expandTitle} accessibilityHint={t('common.expand')}>
          {frame(
            <>
              {/* A drag scrolls the text; only a tap opens the editor. */}
              <ScrollView style={{ height }} contentContainerStyle={styles.readerContent}>
                <Text style={[styles.reader, !input.value && { color: colors.textFaint }]}>
                  {input.value || input.placeholder}
                </Text>
              </ScrollView>
              <View style={styles.expand} pointerEvents="none">
                <SFIcon name="arrow.up.left.and.arrow.down.right" fallback="expand-outline" size={15} color={colors.textFaint} />
              </View>
            </>
          )}
        </Pressable>
      </Link.AppleZoom>
    </Link>
  ) : (
    frame(
      <TextInput
        {...inputColors}
        {...input}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.fieldInput, multiline && styles.multilineInput, multiline && { height }]}
      />
    )
  )

  return (
    <View style={styles.fieldWrap}>
      {label ? (
        <View style={styles.fieldLabelRow}>
          {star ? <Star size={9} color={colors.accent} rotation={10} /> : null}
          <Text style={styles.fieldLabel}>{label}</Text>
        </View>
      ) : null}
      {field}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    fieldWrap: { marginBottom: 16 },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 4 },
    fieldLabel: { color: colors.textFaint, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    box: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    // One line: a set height with no vertical padding, so the native field centers the text
    // and the placeholder itself. With padding they could settle at different heights
    // (the placeholder sat lower when the font fell back for Cyrillic).
    fieldInput: { color: colors.text, fontSize: 16, height: 46, paddingVertical: 0, paddingHorizontal: 14 },
    multilineInput: { lineHeight: LINE_HEIGHT, textAlignVertical: 'top', paddingVertical: 12 },
    // The text of an expanding field, laid out like the input it stands in for, with
    // room on the right for the expand mark.
    readerContent: { paddingVertical: 12, paddingLeft: 14, paddingRight: 40 },
    reader: { color: colors.text, fontSize: 16, lineHeight: LINE_HEIGHT },
    expand: { position: 'absolute', top: 10, right: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    fieldHint: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: 6, marginHorizontal: 4 },
  })
