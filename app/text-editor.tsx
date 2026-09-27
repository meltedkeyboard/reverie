import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, StyleSheet, TextInput, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useInputColors } from '@/components/Field'
import { DrawnFormScreenHeader, FormScreenHeader } from '@/components/FormScreenHeader'
import { useHeaderHeight } from '@/components/GlassHeader'
import { textDraft } from '@/lib/textDraft'
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
  // Read once: the draft may be replaced under a screen still closing.
  const [draft] = useState(textDraft)
  const [text, setText] = useState(draft?.value ?? '')

  useEffect(() => {
    if (!draft) router.back()
  }, [draft, router])

  if (!draft) return null
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* A TextInput focuses itself when a touch ends, even one that scrolled the text,
          since a native scroll doesn't cancel the JS touch. On iOS this view takes the
          JS touch instead; a tap still puts the caret in natively, where it landed. */}
      <View style={styles.screen} onStartShouldSetResponderCapture={Platform.OS === 'ios' ? () => true : undefined}>
        <TextInput
          {...inputColors}
          value={text}
          onChangeText={(value) => {
            setText(value)
            draft.onChange(value)
          }}
          placeholder={draft.placeholder}
          multiline
          // The padding scrolls along with the text, so it passes under the header.
          style={[styles.input, { paddingTop: headerHeight + 12, paddingBottom: insets.bottom + 24 }]}
        />
      </View>
      {/* Opened with a zoom from the field, so on iOS the header is drawn here rather than
          by the native bar; see DrawnFormScreenHeader. */}
      {Platform.OS === 'ios' ? <DrawnFormScreenHeader title={draft.title} /> : <FormScreenHeader title={draft.title} />}
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
