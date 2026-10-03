import { ActionSheetIOS, Alert, Platform } from 'react-native'

import { t } from '@/i18n'

import { openAndroidDialog } from './androidDialog'
import { lastPointer } from './pointer'

export type SheetAction = {
  label: string
  destructive?: boolean
  onSelect?: () => void
  // A submenu: choosing this action opens its own sheet with these.
  children?: SheetAction[]
}

export type Confirmation = {
  title: string
  message?: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
}

export type TextPrompt = {
  title: string
  message?: string
  initial?: string
  confirmLabel: string
  onSubmit: (text: string) => void
}

export function showSheet(title: string | undefined, items: SheetAction[]) {
  const actions = items.map(({ label, destructive, onSelect, children }) => ({
    label,
    destructive,
    onSelect: children ? () => showSheet(label, children) : (onSelect ?? (() => {})),
  }))
  if (Platform.OS === 'web') return openAndroidDialog({ kind: 'sheet', title, actions, anchor: lastPointer() })
  if (Platform.OS !== 'ios') return openAndroidDialog({ kind: 'sheet', title, actions })
  const destructive = actions.findIndex((action) => action.destructive)
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...actions.map((action) => action.label), t('common.cancel')],
      destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
      cancelButtonIndex: actions.length,
    },
    (index) => actions[index]?.onSelect()
  )
}

export function confirm({ title, message, confirmLabel, destructive, onConfirm }: Confirmation) {
  // Alert.alert does nothing on the web, so the question is a sheet with one answer.
  if (Platform.OS === 'web') {
    return openAndroidDialog({ kind: 'confirm', title, message, confirmLabel, destructive, cancelable: true, onConfirm })
  }
  Alert.alert(title, message, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ])
}

export function promptText(prompt: TextPrompt) {
  if (Platform.OS !== 'ios') return openAndroidDialog({ kind: 'prompt', prompt })
  const { title, message, initial, confirmLabel, onSubmit } = prompt
  Alert.prompt(
    title,
    message,
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: confirmLabel, onPress: (text?: string) => onSubmit(text ?? '') },
    ],
    'plain-text',
    initial
  )
}

export function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    return openAndroidDialog({ kind: 'confirm', title, message, confirmLabel: t('common.ok'), cancelable: false, onConfirm: () => {} })
  }
  Alert.alert(title, message)
}

