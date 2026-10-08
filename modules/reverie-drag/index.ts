import { requireNativeView, requireOptionalNativeModule } from 'expo'
import type { ComponentType } from 'react'
import type { ViewProps } from 'react-native'

export type DragMenuEntry = { label: string; systemImage?: string; destructive?: boolean; children?: DragMenuEntry[] }
export type DropFile = { uri: string; kind: 'archive' | 'card' }

type DragModule = {
  fulfill(token: string, uri: string | null): void
  renderInitial(letter: string, tint: string, size: number): string
}

type DragCardProps = ViewProps & {
  menu: DragMenuEntry[]
  dragEnabled: boolean
  // What the card carries when dragged: one character, or the members of a group.
  items: { id: number; name: string }[]
  acceptsCards: boolean
  accentColor: string
  cornerRadius: number
  onMenuSelect: (e: { nativeEvent: { path: number[] } }) => void
  onProvide: (e: { nativeEvent: { token: string; kind: 'archive' | 'card'; id: number } }) => void
  onDragState: (e: { nativeEvent: { active: boolean } }) => void
  onDropCards: (e: { nativeEvent: { ids: number[] } }) => void
}

type DropTargetProps = ViewProps & {
  groupedIds: number[]
  onDropFiles: (e: { nativeEvent: { files: DropFile[] } }) => void
  onDropCards: (e: { nativeEvent: { ids: number[] } }) => void
}

// Missing in Expo Go, on Android and on the web: the cards then keep the plain menu.
export const dragModule = requireOptionalNativeModule<DragModule>('ReverieDrag')

export const DragCardView: ComponentType<DragCardProps> | null = dragModule ? requireNativeView('ReverieDrag', 'DragCardView') : null
export const DropTargetView: ComponentType<DropTargetProps> | null = dragModule ? requireNativeView('ReverieDrag', 'DropTargetView') : null

// Whether cards are in the air: a tap on a card then adds it to the drag, not opens it.
export const dragSession = { active: false }
