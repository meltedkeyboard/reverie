import { requireNativeView, requireOptionalNativeModule } from 'expo'
import type { ComponentType } from 'react'
import type { ViewProps } from 'react-native'

export type DragMenuEntry = { label: string; systemImage?: string; destructive?: boolean; children?: DragMenuEntry[] }
export type DropFile = { uri: string; kind: 'archive' | 'card' }

type DragModule = { fulfill(token: string, uri: string | null): void }

type DragCardProps = ViewProps & {
  menu: DragMenuEntry[]
  dragEnabled: boolean
  name: string
  cornerRadius: number
  onMenuSelect: (e: { nativeEvent: { path: number[] } }) => void
  onProvide: (e: { nativeEvent: { token: string; kind: 'archive' | 'card' } }) => void
}

type DropTargetProps = ViewProps & { onDropFiles: (e: { nativeEvent: { files: DropFile[] } }) => void }

// Missing in Expo Go, on Android and on the web: the cards then keep the plain menu.
export const dragModule = requireOptionalNativeModule<DragModule>('ReverieDrag')

export const DragCardView: ComponentType<DragCardProps> | null = dragModule ? requireNativeView('ReverieDrag', 'DragCardView') : null
export const DropTargetView: ComponentType<DropTargetProps> | null = dragModule ? requireNativeView('ReverieDrag', 'DropTargetView') : null
