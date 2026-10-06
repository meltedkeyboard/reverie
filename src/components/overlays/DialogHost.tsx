import { useSyncExternalStore } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

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
  return (
    <Modal visible={dialog !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={closeDialog}>
      <View style={[styles.backdrop, dialog?.kind === 'prompt' && styles.top]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDialog} />
        {dialog?.kind === 'sheet' ? <Sheet title={dialog.title} actions={dialog.actions} /> : null}
        {dialog?.kind === 'prompt' ? <Prompt key={dialog.prompt.title} {...dialog.prompt} /> : null}
      </View>
    </Modal>
  )
}

function Sheet({ title, actions }: { title?: string; actions: { label: string; destructive?: boolean; onSelect: () => void }[] }) {
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const { t } = useTranslation()
  return (
    <View style={styles.sheet}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
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
      <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }]} onPress={closeDialog}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('common.cancel')}</Text>
      </Pressable>
    </View>
  )
}

function Prompt({ title, message, initial, confirmLabel, onSubmit }: { title: string; message?: string; initial?: string; confirmLabel: string; onSubmit: (text: string) => void }) {
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { text, setText, submit } = usePromptState(initial, onSubmit)
  return (
    <View style={styles.card}>
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
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
    // The prompt sits in the upper part, where the keyboard never reaches.
    top: { justifyContent: 'flex-start', paddingTop: 96 },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 24 },
    card: { backgroundColor: colors.surface, borderRadius: 24, marginHorizontal: 24, padding: 20, gap: 12 },
    title: { color: colors.text, fontSize: 18, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 12 },
    promptTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
    message: { color: colors.textMuted, fontSize: 15 },
    row: { paddingHorizontal: 24, paddingVertical: 16 },
    label: { color: colors.text, fontSize: 16 },
    input: {
      color: colors.text,
      fontSize: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    button: { paddingHorizontal: 16, paddingVertical: 10 },
  })
