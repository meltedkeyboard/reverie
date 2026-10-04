import type { SheetAction, TextPrompt } from './dialogs'

// Android has no action sheet and no text prompt in Alert, and the web has none of the three, so they are drawn by
// DialogHost; this is the slot that carries the request from dialogs.tsx to it.
export type AppDialog =
  | {
      kind: 'sheet'
      title?: string
      actions: (Pick<SheetAction, 'label' | 'destructive'> & { onSelect: () => void })[]
      // Web: where the click was, so the menu opens there instead of at the bottom.
      anchor?: { x: number; y: number } | null
    }
  // Web: a question with a confirm button and, if cancelable, a cancel one; a notice has none.
  | { kind: 'confirm'; title: string; message?: string; confirmLabel: string; destructive?: boolean; cancelable: boolean; onConfirm: () => void }
  | { kind: 'prompt'; prompt: TextPrompt }

let current: AppDialog | null = null
const listeners = new Set<() => void>()

export function openDialog(dialog: AppDialog) {
  current = dialog
  listeners.forEach((fn) => fn())
}

export function closeDialog() {
  current = null
  listeners.forEach((fn) => fn())
}

export function subscribeDialog(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getDialog() {
  return current
}
