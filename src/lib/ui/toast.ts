import type { Scheme } from '@/theme'

// A short message that slides in from the top over the screen, like a push notification:
// it takes no touches outside itself and goes away by itself. ToastHost draws it.
export type ToastAction = { label: string; destructive?: boolean; onPress: () => void }

export type Toast = {
  title: string
  message?: string
  tone: 'success' | 'error' | 'info'
  actions?: ToastAction[]
}

export type ShownToast = Toast & { id: number }

let current: ShownToast | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let lastId = 0
const listeners = new Set<() => void>()

// A toast with buttons waits longer, since it asks for a decision.
const LIFETIME = { plain: 4000, error: 7000, actions: 15000 }

function emit() {
  listeners.forEach((fn) => fn())
}

// One at a time: a new toast replaces the one on screen.
export function showToast(toast: Toast) {
  clearTimeout(timer)
  current = { ...toast, id: ++lastId }
  const ms = toast.actions?.length ? LIFETIME.actions : toast.tone === 'error' ? LIFETIME.error : LIFETIME.plain
  timer = setTimeout(dismissToast, ms)
  emit()
}

// The same toast while it is still on screen: tapping again neither restarts it nor
// makes it jump, so a button pressed over and over shows it once.
export function showToastOnce(toast: Toast) {
  if (current?.title === toast.title) return
  showToast(toast)
}

export function dismissToast() {
  clearTimeout(timer)
  if (!current) return
  current = null
  emit()
}

export function subscribeToast(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getToast() {
  return current
}

// A chat shown light or dark over its picture has the toast in that scheme too while it is
// on top, since the toast is drawn over it from the root. The last one to take it holds it,
// so a chat losing the screen to another does not take the other's back.
let scheme: Scheme | null = null
let schemeHolder: object | null = null
const schemeListeners = new Set<() => void>()

export function holdToastScheme(next: Scheme) {
  const holder = {}
  schemeHolder = holder
  scheme = next
  schemeListeners.forEach((fn) => fn())
  return () => {
    if (schemeHolder !== holder) return
    schemeHolder = null
    scheme = null
    schemeListeners.forEach((fn) => fn())
  }
}

export function subscribeToastScheme(fn: () => void) {
  schemeListeners.add(fn)
  return () => {
    schemeListeners.delete(fn)
  }
}

export function getToastScheme() {
  return scheme
}
