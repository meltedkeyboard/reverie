import { ActionSheetIOS, Alert, Platform } from 'react-native'

import { t } from '@/i18n'

import { openAndroidDialog } from './androidDialog'

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
  if (Platform.OS === 'android') return openAndroidDialog({ kind: 'sheet', title, actions })
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
  Alert.alert(title, message, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ])
}

export function promptText(prompt: TextPrompt) {
  if (Platform.OS === 'android') return openAndroidDialog({ kind: 'prompt', prompt })
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
  Alert.alert(title, message)
}

