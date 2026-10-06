import { useEffect, useSyncExternalStore } from 'react'
import { makeMutable } from 'react-native-reanimated'

import { isDesktop } from '@/lib/core/platform'

export const SIDEBAR_WIDTH = isDesktop ? 260 : 300
// On the desktop the rail is just wide enough for a square row (6 + 16 icon + 6), its
// margins of 8 and the 1 pt line on the right.
export const RAIL_WIDTH = isDesktop ? 45 : 54

// How far the sidebar is folded: 0 open, 1 a rail. Kept outside the sidebar, so what lies
// beside it (the patterns behind the screens) can follow the same frames.
export const sidebarFold = makeMutable(0)

export function sidebarWidthAt(fold: number) {
  'worklet'
  return SIDEBAR_WIDTH + (RAIL_WIDTH - SIDEBAR_WIDTH) * fold
}

// Whether a sidebar is on screen at all: not in the compact layout, not over a full-screen route.
let shown = false
const listeners = new Set<() => void>()

export function useMarkSidebarShown() {
  useEffect(() => {
    shown = true
    listeners.forEach((listener) => listener())
    return () => {
      shown = false
      listeners.forEach((listener) => listener())
    }
  }, [])
}

export function useSidebarShown() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => shown
  )
}
