import { useEffect, useRef } from 'react'

import { isWeb } from '@/lib/platform'

// Runs `handler` for the key presses `matches` accepts, anywhere in the window. Web only; the
// handler it calls is always the latest one, so it can use the current state.
export function useWindowKey(matches: (e: KeyboardEvent) => boolean, handler: (e: KeyboardEvent) => void, active = true) {
  const latest = useRef({ matches, handler })
  latest.current = { matches, handler }

  useEffect(() => {
    if (!isWeb || !active) return
    const onKey = (e: KeyboardEvent) => {
      if (latest.current.matches(e)) latest.current.handler(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

export const isKey = (key: string) => (e: KeyboardEvent) => e.key === key
