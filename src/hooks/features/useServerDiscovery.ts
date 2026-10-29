import { useCallback, useEffect, useRef, useState } from 'react'

import { discoverServers, type FoundServer } from '@/api/discover'
import * as Haptics from '@/lib/ui/haptics'

export type DiscoveryState = 'idle' | 'searching' | 'done' | 'noWifi'

// A search of the local network for model servers, as onboarding and the Servers screen
// both run it: what has answered so far, sorted by address, and whether it is still going.
// A new search stops the one before it, and leaving the screen stops it too.
export function useServerDiscovery() {
  const [state, setState] = useState<DiscoveryState>('idle')
  const [found, setFound] = useState<FoundServer[]>([])
  const running = useRef<AbortController | null>(null)

  useEffect(() => () => running.current?.abort(), [])

  const search = useCallback(async () => {
    running.current?.abort()
    const ctrl = new AbortController()
    running.current = ctrl
    setFound([])
    setState('searching')
    const wifi = await discoverServers(ctrl.signal, (server) => {
      Haptics.selectionAsync()
      setFound((prev) => [...prev, server].sort((a, b) => a.baseUrl.localeCompare(b.baseUrl, undefined, { numeric: true })))
    })
    if (ctrl.signal.aborted) return
    running.current = null
    setState(wifi ? 'done' : 'noWifi')
  }, [])

  return { state, found, search }
}
