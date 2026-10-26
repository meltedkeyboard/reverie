import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, TextInput, View, type TextInputInstance } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useInputColors } from '@/components/controls/Field'
import { BarButton, DrawnFormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useHeaderHeight } from '@/components/chrome/GlassHeader'
import { useTranslation } from '@/i18n'
import { textDraft } from '@/lib/chat/textDraft'
import { useColors, useStyles, type Colors } from '@/theme'

// A long text of a form (a system prompt, a scene) on the whole screen, like a note.
// Every change goes straight back to the form, so leaving is all there is to it.
export default function TextEditorScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const inputColors = useInputColors()
  const { t } = useTranslation()
  const input = useRef<TextInputInstance>(null)
  // Read once: the draft may be replaced under a screen still closing.
  const [draft] = useState(textDraft)
  const [text, setText] = useState(draft?.value ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!draft) router.back()
  }, [draft, router])

  if (!draft) return null
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* A TextInput focuses itself when a touch ends, even one that scrolled the text,
          since a native scroll doesn't cancel the JS touch. This view takes the JS touch
          instead; a tap still puts the caret in natively, where it landed. */}
      <View style={styles.screen} onStartShouldSetResponderCapture={() => true}>
        <TextInput
          {...inputColors}
          ref={input}
          value={text}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChangeText={(value) => {
            setText(value)
            draft.onChange(value)
          }}
          placeholder={draft.placeholder}
          multiline
          // The padding scrolls along with the text, so it passes under the header.
          style={[
            styles.input,
            {
              paddingTop: headerHeight + 12,
              paddingBottom: insets.bottom + 24,
              paddingLeft: Math.max(20, insets.left + 8),
              paddingRight: Math.max(20, insets.right + 8),
            },
          ]}
        />
      </View>
      {/* Opened with a zoom from the field, so the header is drawn here rather than by the
          native bar; see DrawnFormScreenHeader. */}
      {/* Done, as in Notes, while typing. The text is already back in the form, so all it
          does is put the keyboard away; the form saves it the way it saves everything else. */}
      <DrawnFormScreenHeader
        title={draft.title}
        right={
          editing ? (
            <BarButton
              symbol="checkmark"
              fallback="checkmark"
              onPress={() => input.current?.blur()}
              accessibilityLabel={t('common.done')}
              prominent
            />
          ) : null
        }
      />
    </KeyboardAvoidingView>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1 },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: 17,
      lineHeight: 25,
      paddingHorizontal: 20,
      textAlignVertical: 'top',
    },
  })
