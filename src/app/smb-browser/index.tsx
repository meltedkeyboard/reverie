import { useLayoutEffect, useRef } from 'react'
import { useNavigation } from 'expo-router'

import { smbBrowserSession } from '@/lib/transfer/smbBrowserSession'
import { SmbDirectoryScreen } from './SmbDirectoryScreen'

export default function SmbBrowserRootScreen() {
  const navigation = useNavigation<any>()
  const session = smbBrowserSession()
  const didReset = useRef(false)

  useLayoutEffect(() => {
    if (!didReset.current && session?.initialPath) {
      const parts = session.initialPath.split('/').filter(Boolean)
      if (parts.length > 0) {
        didReset.current = true
        // Instantly prime the stack history so the target folder is on top and root is underneath without an extra push animation.
        navigation.reset({
          index: 1,
          routes: [
            { name: 'index' },
            { name: '[...subpath]', params: { subpath: parts } },
          ],
        })
      }
    }
  }, [session?.initialPath, navigation])

  return <SmbDirectoryScreen segments={[]} isRoot />
}
