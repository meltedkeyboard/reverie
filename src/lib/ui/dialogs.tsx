import { ActionSheetIOS, Alert } from 'react-native'

import { t } from '@/i18n'

import { openDialog } from './dialogStore'
import { isIOS, isWeb } from '../core/platform'
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
  // Everywhere but iOS the sheet is drawn by the app; on the web it opens where the click was.
  if (!isIOS) return openDialog({ kind: 'sheet', title, actions, anchor: isWeb ? lastPointer() : undefined })
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
  if (isWeb) {
    return openDialog({ kind: 'confirm', title, message, confirmLabel, destructive, cancelable: true, onConfirm })
  }
  Alert.alert(title, message, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ])
}

export function promptText(prompt: TextPrompt) {
  if (!isIOS) return openDialog({ kind: 'prompt', prompt })
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
  if (isWeb) {
    return openDialog({ kind: 'confirm', title, message, confirmLabel: t('common.ok'), cancelable: false, onConfirm: () => {} })
  }
  Alert.alert(title, message)
}

