import { useEffect, useState } from 'react'

import type { MenuItem } from '@/components/overlays/NativeMenu'
import { useDatabase } from '@/db/provider'
import { DEFAULT_SERVER, loadServers, type ServerProfile } from '@/db/prefs/settings'
import { useConnectionTest } from '@/hooks/features/useConnectionTest'

// The fields of one server, as its screen and onboarding both show them: the stored values once
// they are read (none for a new one), the model menu, and the connection test that picks a lone
// model by itself. onChange runs when a field that makes the loaded model stale changes.
export function useServerForm(serverId?: string, onChange?: () => void) {
  const db = useDatabase()
  const [cfg, setCfg] = useState<ServerProfile>(DEFAULT_SERVER)
  const [loaded, setLoaded] = useState(!serverId)
  const { status, models, test, reset: resetStatus } = useConnectionTest()

  useEffect(() => {
    if (!serverId) return
    loadServers(db).then((servers) => {
      const stored = servers.find((s) => s.id === serverId)
      if (stored) setCfg(stored)
      setLoaded(true)
    })
  }, [db, serverId])

  const update = (patch: Partial<ServerProfile>) => {
    setCfg((prev) => ({ ...prev, ...patch }))
    const server = patch.baseUrl !== undefined || patch.apiKey !== undefined
    if (server) resetStatus()
    if (server || patch.model !== undefined) onChange?.()
  }

  // The models the server lists are picked from a system menu, the chosen one checked.
  const modelItems = (list: string[]): MenuItem[] =>
    list.map((id) => ({
      label: id,
      systemImage: id === cfg.model ? 'checkmark' : undefined,
      onSelect: () => update({ model: id }),
    }))

  // One model alone is taken as it is; out of several the user picks from the field.
  const onTest = async () => {
    const found = await test(cfg)
    if (found.length === 1 && !found.includes(cfg.model)) update({ model: found[0] })
    return found
  }

  return { cfg, setCfg, loaded, update, status, models, modelItems, onTest }
}
