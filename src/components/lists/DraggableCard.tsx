import { useColors } from '@/theme'

import type { MenuItem } from '../overlays/NativeMenu'
import { DragCardView, dragSession, type DragMenuEntry } from '../../../modules/reverie-drag'

export type DragCardProps = {
  menu: MenuItem[]
  // What a drag carries: the character, or every member of a group.
  items: { id: number; name: string }[]
  dragEnabled: boolean
  // The characters of the group the card is in or is: no target for each other.
  groupIds?: number[]
  // Other cards dropped on this one: onto a character they make a group, onto a group they join it.
  onDropCards?: (ids: number[]) => void
  // A drop outside the app asked for a dragged character as a file: the archive or the card PNG.
  onProvide?: (token: string, kind: 'archive' | 'card', id: number) => void
  children: React.ReactNode
}

const toEntries = (items: MenuItem[]): DragMenuEntry[] =>
  items.map(({ label, systemImage, destructive, children }) => ({ label, systemImage, destructive, children: children && toEntries(children) }))

// On iOS a long press on a card is the system's: the menu, and moving the finger lifts the
// card to drop into Files, Photos, another app or onto another card, with a tap on other
// cards adding them to the stack. Elsewhere the card stays as it is.
export function DraggableCard({ menu, items, dragEnabled, groupIds = [], onDropCards, onProvide, children }: DragCardProps) {
  const colors = useColors()
  if (!DragCardView) return children
  return (
    <DragCardView
      menu={toEntries(menu)}
      items={items}
      dragEnabled={dragEnabled}
      acceptsCards={dragEnabled && !!onDropCards}
      accentColor={colors.accent}
      shadeColor={colors.bg}
      groupIds={groupIds}
      cornerRadius={20}
      onMenuSelect={({ nativeEvent }) => {
        let item: MenuItem | undefined = { label: '', children: menu }
        for (const index of nativeEvent.path) item = item?.children?.[index]
        item?.onSelect?.()
      }}
      onProvide={({ nativeEvent }) => onProvide?.(nativeEvent.token, nativeEvent.kind, nativeEvent.id)}
      onDragState={({ nativeEvent }) => {
        dragSession.active = nativeEvent.active
      }}
      onMenuState={({ nativeEvent }) => {
        dragSession.menuOpen = nativeEvent.open
      }}
      onDropCards={({ nativeEvent }) => onDropCards?.(nativeEvent.ids)}
    >
      {children}
    </DragCardView>
  )
}

// A tap on a card opens it, except while cards are in the air (then it adds it to the drag)
// or while its menu is up.
export const unlessDragging = (open: () => void) => () => {
  if (!dragSession.active && !dragSession.menuOpen) open()
}
