import { useCallback, useEffect, useState } from 'react'

import { useDatabase } from '@/db/provider'
import { loadActiveServerId, loadFailover, loadServers, onServersChanged, type ServerProfile } from '@/db/prefs/settings'

// The servers in their order, which one is current and whether another takes over, read
// again whenever any of it changes, on this screen or another.
export function useServers() {
  const db = useDatabase()
  const [servers, setServers] = useState<ServerProfile[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [failover, setFailover] = useState(true)

  const reload = useCallback(async () => {
    const [list, active, on] = await Promise.all([loadServers(db), loadActiveServerId(db), loadFailover(db)])
    setServers(list)
    setActiveId(active)
    setFailover(on)
  }, [db])

  useEffect(() => {
    reload()
    return onServersChanged(reload)
  }, [reload])

  return { servers, setServers, activeId, failover, setFailover, reload }
}
