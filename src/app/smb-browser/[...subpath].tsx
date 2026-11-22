import { useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'

import { SmbDirectoryScreen } from './SmbDirectoryScreen'

export default function SmbBrowserSubpathScreen() {
  const { subpath } = useLocalSearchParams<{ subpath?: string[] | string }>()
  const segments = useMemo(() => {
    if (!subpath) return []
    if (Array.isArray(subpath)) return subpath
    return subpath.split('/').filter(Boolean)
  }, [subpath])

  return <SmbDirectoryScreen segments={segments} />
}
