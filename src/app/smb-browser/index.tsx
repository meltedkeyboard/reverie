import { useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'

import { smbBrowserSession } from '@/lib/transfer/smbBrowserSession'
import { SmbDirectoryScreen } from './SmbDirectoryScreen'

export default function SmbBrowserRootScreen() {
  const router = useRouter()
  const session = smbBrowserSession()
  const didPrime = useRef(false)

  useEffect(() => {
    if (!didPrime.current && session?.initialPath) {
      const parts = session.initialPath.split('/').filter(Boolean)
      if (parts.length > 0) {
        didPrime.current = true
        router.push({ pathname: '/smb-browser/[...subpath]', params: { subpath: parts } })
      }
    }
  }, [session?.initialPath, router])

  return <SmbDirectoryScreen segments={[]} isRoot />
}
