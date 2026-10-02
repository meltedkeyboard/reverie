import type { SheetAction, TextPrompt } from './dialogs'

// Android has no action sheet and no text prompt in Alert, so those two are drawn by
// DialogHost; this is the slot that carries the request from dialogs.tsx to it.
export type AndroidDialog =
  | { kind: 'sheet'; title?: string; actions: (Pick<SheetAction, 'label' | 'destructive'> & { onSelect: () => void })[] }
  | { kind: 'prompt'; prompt: TextPrompt }

let current: AndroidDialog | null = null
const listeners = new Set<() => void>()

export function openAndroidDialog(dialog: AndroidDialog) {
  current = dialog
  listeners.forEach((fn) => fn())
}

export function closeAndroidDialog() {
  current = null
  listeners.forEach((fn) => fn())
}

export function subscribeAndroidDialog(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getAndroidDialog() {
  return current
}
