import { useSyncExternalStore } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, SlideInDown, SlideOutDown } from 'react-native-reanimated'

import { WebDialogHost } from '@/components/overlays/WebDialogs'
import { usePromptState } from '@/hooks/chat/usePromptState'
import { useTranslation } from '@/i18n'
import { closeDialog, getDialog, subscribeDialog } from '@/lib/ui/dialogStore'
import { useStyles, useTheme, type Colors } from '@/theme'
import { isWeb } from '@/lib/core/platform'

export function DialogHost() {
  return isWeb ? <WebDialogHost /> : <SheetDialogHost />
}

function SheetDialogHost() {
  const dialog = useSyncExternalStore(subscribeDialog, getDialog)
  const styles = useStyles(createStyles)
  const handleCancel = () => {
    if (dialog?.kind === 'sheet') dialog.onCancel?.()
    closeDialog()
  }
  return (
    <Modal
      visible={dialog !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleCancel}
    >
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(120)}
        style={[styles.backdrop, dialog?.kind === 'prompt' && styles.top]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleCancel} />
        {dialog?.kind === 'sheet' ? (
          <Sheet
            key={dialog.title ?? 'sheet'}
            title={dialog.title}
            message={dialog.message}
            actions={dialog.actions}
            onCancel={handleCancel}
          />
        ) : null}
        {dialog?.kind === 'prompt' ? <Prompt key={dialog.prompt.title} {...dialog.prompt} /> : null}
      </Animated.View>
    </Modal>
  )
}

function Sheet({
  title,
  message,
  actions,
  onCancel,
}: {
  title?: string
  message?: string
  actions: { label: string; destructive?: boolean; onSelect: () => void }[]
  onCancel?: () => void
}) {
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const { t } = useTranslation()
  return (
    <Animated.View
      entering={SlideInDown.springify().damping(28).stiffness(300).mass(0.8)}
      exiting={SlideOutDown.duration(180)}
      style={styles.sheet}
    >
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {message ? <Text style={styles.sheetMessage}>{message}</Text> : null}
      {actions.map((action, index) => (
        <Pressable
          key={index}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }]}
          onPress={() => {
            closeDialog()
            action.onSelect()
          }}
        >
          <Text style={[styles.label, action.destructive && { color: colors.danger }]}>{action.label}</Text>
        </Pressable>
      ))}
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }]}
        onPress={() => {
          onCancel?.()
          closeDialog()
        }}
      >
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('common.cancel')}</Text>
      </Pressable>
    </Animated.View>
  )
}

function Prompt({ title, message, initial, confirmLabel, onSubmit }: { title: string; message?: string; initial?: string; confirmLabel: string; onSubmit: (text: string) => void }) {
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { text, setText, submit } = usePromptState(initial, onSubmit)
  return (
    <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(150)} style={styles.card}>
      <Text style={styles.promptTitle}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
      />
      <View style={styles.buttons}>
        <Pressable style={styles.button} onPress={closeDialog}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={submit}>
          <Text style={[styles.label, { color: colors.accent }]}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
    // The prompt sits in the upper part, where the keyboard never reaches.
    top: { justifyContent: 'flex-start', paddingTop: 96 },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 8, borderTopRightRadius: 8, paddingTop: 8, paddingBottom: 24 },
    card: { backgroundColor: colors.surface, borderRadius: 8, marginHorizontal: 24, padding: 20, gap: 12 },
    title: { color: colors.text, fontSize: 18, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 12 },
    sheetMessage: { color: colors.textMuted, fontSize: 14, lineHeight: 20, paddingHorizontal: 20, paddingBottom: 10 },
    promptTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
    message: { color: colors.textMuted, fontSize: 15 },
    row: { paddingHorizontal: 24, paddingVertical: 16 },
    label: { color: colors.text, fontSize: 16 },
    input: {
      color: colors.text,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    button: { paddingHorizontal: 16, paddingVertical: 10 },
  })
