// A chat was made, renamed, deleted or written in. The sidebar of the wide layout listens, so
// its list follows without waiting for a screen to regain focus.
const listeners = new Set<() => void>()

export function notifyChatsChanged() {
  listeners.forEach((listener) => listener())
}

export function onChatsChanged(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
