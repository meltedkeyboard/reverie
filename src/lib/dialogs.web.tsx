import { useEffect, useState, useSyncExternalStore } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { useInputColors } from '@/components/Field'
import { t } from '@/i18n'
import type { Confirmation, SheetAction, TextPrompt } from '@/lib/dialogs.types'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

// Actions get the text of the input field; dialogs without one pass an empty string.
type DialogAction = {
  label: string
  destructive?: boolean
  onSelect: (text: string) => void
}

type Dialog = {
  id: number
  title?: string
  message?: string
  input?: { initial: string }
  actions: DialogAction[]
  dismissLabel: string
}

// `Alert` is an empty stub in react-native-web and `ActionSheetIOS` does not
// exist there at all, so the browser build draws the dialogs itself. One at a
// time is enough: the screens never ask for two.
let current: Dialog | null = null
let lastId = 0
const listeners = new Set<() => void>()

function publish(next: Omit<Dialog, 'id'> | null) {
  current = next && { ...next, id: ++lastId }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function showSheet(title: string | undefined, actions: SheetAction[]) {
  publish({ title, actions, dismissLabel: t('common.cancel') })
}

export function confirm({ title, message, confirmLabel, destructive, onConfirm }: Confirmation) {
  publish({
    title,
    message,
    actions: [{ label: confirmLabel, destructive, onSelect: onConfirm }],
    dismissLabel: t('common.cancel'),
  })
}

export function promptText({ title, message, initial, confirmLabel, onSubmit }: TextPrompt) {
  publish({
    title,
    message,
    input: { initial: initial ?? '' },
    actions: [{ label: confirmLabel, onSelect: onSubmit }],
    dismissLabel: t('common.cancel'),
  })
}

export function showMessage(title: string, message: string) {
  publish({ title, message, actions: [], dismissLabel: t('common.close') })
}

export function DialogHost() {
  const styles = useStyles(createStyles)
  const dialog = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  )

  useEffect(() => {
    if (!dialog) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') publish(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dialog])

  if (!dialog) return null

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => publish(null)}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => publish(null)} />
        <DialogCard key={dialog.id} dialog={dialog} />
      </View>
    </Modal>
  )
}

function DialogCard({ dialog }: { dialog: Dialog }) {
  const colors = useColors()
  const inputColors = useInputColors()
  const styles = useStyles(createStyles)
  const [text, setText] = useState(dialog.input?.initial ?? '')

  const select = (action: DialogAction) => {
    publish(null)
    action.onSelect(text)
  }

  return (
    <View style={styles.card}>
      {dialog.title ? <Text style={styles.title}>{dialog.title}</Text> : null}
      {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
      {dialog.input ? (
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => select(dialog.actions[0])}
          autoFocus
          selectTextOnFocus
          {...inputColors}
          style={styles.input}
        />
      ) : null}
      {dialog.actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={() => select(action)}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.buttonText, action.destructive && { color: colors.danger }]}>{action.label}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => publish(null)}
        style={({ pressed }) => [styles.button, styles.dismiss, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.dismissText}>{dialog.dismissLabel}</Text>
      </Pressable>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.55)', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 380,
    gap: 8,
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, marginBottom: 2 },
  message: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  input: {
    height: 46,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  button: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  dismiss: { backgroundColor: 'transparent', borderColor: 'transparent' },
  dismissText: { color: colors.textMuted, fontSize: 15 },
})
