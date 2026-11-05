import { usePathname } from 'expo-router'
import * as ScreenOrientation from 'expo-screen-orientation'
import { useEffect, useRef } from 'react'

import { isTablet, isWeb } from '@/lib/core/platform'

function allowsLandscape(path: string | null | undefined) {
  if (!path) return false
  return path === '/viewer' || path === '/text-editor' || path === '/chat' || path.startsWith('/chat/')
}

export function useScreenOrientation() {
  const pathname = usePathname()
  const unlocked = useRef<boolean | null>(null)

  useEffect(() => {
    if (isWeb) return

    // Tablets have no orientation restrictions.
    if (isTablet) {
      if (unlocked.current !== true) {
        unlocked.current = true
        ScreenOrientation.unlockAsync().catch(() => {})
      }
      return
    }

    const allow = allowsLandscape(pathname)
    if (unlocked.current === allow) return

    unlocked.current = allow
    if (allow) {
      ScreenOrientation.unlockAsync().catch(() => {})
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {})
    }
  }, [pathname])
}
