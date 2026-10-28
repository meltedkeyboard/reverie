import { requireNativeView, requireOptionalNativeModule } from 'expo'
import type { ComponentType } from 'react'
import type { ViewProps } from 'react-native'

export type DragMenuEntry = { label: string; systemImage?: string; destructive?: boolean; children?: DragMenuEntry[] }
export type DropFile = { uri: string; kind: 'archive' | 'card' }

export type RowFace = { uri?: string | null; letter: string; tint: string }

type DragModule = {
  fulfill(token: string, uri: string | null): void
  renderInitial(letter: string, tint: string, size: number): string
  rowAvatar(faces: RowFace[], side: number, scale: number, ring: string): Promise<string>
}

type DragCardProps = ViewProps & {
  menu: DragMenuEntry[]
  dragEnabled: boolean
  // False for a card that has the menu but is never lifted into a drag.
  draggable?: boolean
  // What the card carries when dragged: one character, or the members of a group.
  items: { id: number; name: string }[]
  acceptsCards: boolean
  accentColor: string
  shadeColor: string
  groupIds: number[]
  cornerRadius: number
  onMenuSelect: (e: { nativeEvent: { path: number[] } }) => void
  onProvide: (e: { nativeEvent: { token: string; kind: 'archive' | 'card'; id: number } }) => void
  onDragState: (e: { nativeEvent: { active: boolean } }) => void
  onMenuState: (e: { nativeEvent: { open: boolean } }) => void
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
// Whether a card's menu is up: the touch that opened it must not open the card too.
export const dragSession = { active: false, menuOpen: false }

export type CardRowEvent =
  | { event: 'menu'; path: number[] }
  | { event: 'provide'; token: string; kind: 'archive' | 'card'; id: number }
  | { event: 'dragState'; active: boolean }
  | { event: 'menuState'; open: boolean }
  | { event: 'drop'; ids: number[] }

type CardRowParams = {
  items: { id: number; name: string }[]
  menu: DragMenuEntry[]
  enabled: boolean
  acceptsCards: boolean
  groupIds: number[]
  accentColor: string
  shadeColor: string
}

// The modifier that makes a row of the system list a character's card: the menu, the drag
// and the drop of DragCardView, on the list's own cell (see CardRow.swift). It is a modifier
// config of @expo/ui built by hand, as `createModifierWithEventListener` would, so that this
// file does not load @expo/ui where it is missing.
export const cardRow = (params: CardRowParams, onEvent: (event: CardRowEvent) => void) => ({
  $type: 'reverieCardRow',
  ...params,
  eventListener: onEvent as (args: unknown) => void,
})
