import { useEffect, useMemo, useRef } from 'react'

// One cancellable task at a time, cancelled when the component goes away. finish tells
// whether ctrl is still the current task, so a superseded one doesn't reset the state
// of the task that replaced it.
export function useAbortable() {
  const ref = useRef<AbortController | null>(null)
  useEffect(() => () => ref.current?.abort(), [])
  return useMemo(
    () => ({
      current: () => ref.current,
      start() {
        ref.current?.abort()
        const ctrl = new AbortController()
        ref.current = ctrl
        return ctrl
      },
      finish(ctrl: AbortController) {
        if (ref.current !== ctrl) return false
        ref.current = null
        return true
      },
      stop: () => ref.current?.abort(),
      // Cancels and forgets the task at once, without waiting for it to finish.
      reset() {
        ref.current?.abort()
        ref.current = null
      },
    }),
    []
  )
}
