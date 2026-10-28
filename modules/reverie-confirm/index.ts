import { requireNativeView, requireOptionalNativeModule } from 'expo'
import type { ComponentType } from 'react'
import type { ViewProps } from 'react-native'

type ConfirmButtonProps = ViewProps & {
  systemImage: string
  iconColor: string
  dark: boolean
  label: string
  // What acting does, in a sentence, and the labels of the destructive and cancel buttons.
  message: string
  action: string
  cancel: string
  asks: boolean
  onConfirm: () => void
}

// Missing in Expo Go, on Android and on the web, which keep the glass button and an alert.
const confirmModule = requireOptionalNativeModule('ReverieConfirm')

export const ConfirmButtonView: ComponentType<ConfirmButtonProps> | null = confirmModule
  ? requireNativeView('ReverieConfirm', 'ConfirmButtonView')
  : null
