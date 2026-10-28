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
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel?: () => void
  // As a TextPrompt's.
  scheme?: 'light' | 'dark' | null
}

export type TextPrompt = {
  title: string
  message?: string
  initial?: string
  confirmLabel: string
  onSubmit: (text: string) => void
  // The scheme of the screen it is asked over, where that is not the app's: a chat over its
  // background. The system's alert otherwise takes the app's.
  scheme?: 'light' | 'dark' | null
}

export type SheetOptions = {
  message?: string
  onCancel?: () => void
  // As a TextPrompt's.
  scheme?: 'light' | 'dark' | null
}

export function showSheet(
  title: string | undefined,
  items: SheetAction[],
  optionsOrCancel?: SheetOptions | (() => void)
) {
  const options = typeof optionsOrCancel === 'function' ? { onCancel: optionsOrCancel } : optionsOrCancel
  const actions = items.map(({ label, destructive, onSelect, children }) => ({
    label,
    destructive,
    onSelect: children ? () => showSheet(label, children, options) : (onSelect ?? (() => {})),
  }))
  // Everywhere but iOS the sheet is drawn by the app; on the web it opens where the click was.
  if (!isIOS) {
    return openDialog({
      kind: 'sheet',
      title,
      message: options?.message,
      actions,
      anchor: isWeb ? lastPointer() : undefined,
      onCancel: options?.onCancel,
    })
  }
  const destructive = actions.findIndex((action) => action.destructive)
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      message: options?.message,
      options: [...actions.map((action) => action.label), t('common.cancel')],
      destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
      cancelButtonIndex: actions.length,
      ...(options?.scheme ? { userInterfaceStyle: options.scheme } : {}),
    },
    (index) => {
      if (index === actions.length) {
        options?.onCancel?.()
      } else {
        actions[index]?.onSelect()
      }
    }
  )
}

export function confirm({ title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel, scheme }: Confirmation) {
  // Alert.alert does nothing on the web, so the question is a sheet with one answer.
  if (isWeb) {
    return openDialog({ kind: 'confirm', title, message, confirmLabel, cancelLabel, destructive, cancelable: true, onConfirm, onCancel })
  }
  Alert.alert(
    title,
    message,
    [
      { text: cancelLabel ?? t('common.cancel'), style: 'cancel', onPress: onCancel },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ],
    scheme ? { userInterfaceStyle: scheme } : undefined
  )
}

export function confirmAsync(options: {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    confirm({
      ...options,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
}

export function promptText(prompt: TextPrompt) {
  if (!isIOS) return openDialog({ kind: 'prompt', prompt })
  const { title, message, initial, confirmLabel, onSubmit, scheme } = prompt
  Alert.prompt(
    title,
    message,
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: confirmLabel, onPress: (text?: string) => onSubmit(text ?? '') },
    ],
    'plain-text',
    initial,
    undefined,
    scheme ? { userInterfaceStyle: scheme } : undefined
  )
}

export function showMessage(title: string, message: string) {
  if (isWeb) {
    return openDialog({ kind: 'confirm', title, message, confirmLabel: t('common.ok'), cancelable: false, onConfirm: () => {} })
  }
  Alert.alert(title, message)
}

