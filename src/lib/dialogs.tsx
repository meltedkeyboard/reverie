import { ActionSheetIOS, Alert } from 'react-native'

import { t } from '@/i18n'

export type SheetAction = {
  label: string
  destructive?: boolean
  onSelect: () => void
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

export function showSheet(title: string | undefined, actions: SheetAction[]) {
  const destructive = actions.findIndex((action) => action.destructive)
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...actions.map((action) => action.label), t('common.cancel')],
      destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
      cancelButtonIndex: actions.length,
      userInterfaceStyle: 'dark',
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

export function promptText({ title, message, initial, confirmLabel, onSubmit }: TextPrompt) {
  Alert.prompt(
    title,
    message,
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: confirmLabel, onPress: (text?: string) => onSubmit(text ?? '') },
    ],
    'plain-text',
    initial,
    'default',
    { userInterfaceStyle: 'dark' }
  )
}

export function showMessage(title: string, message: string) {
  Alert.alert(title, message)
}

// The web build replaces this with an actual overlay; on iOS the system draws it.
export function DialogHost() {
  return null
}
