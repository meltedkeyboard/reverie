import { useEffect, useState } from 'react'

import type { MenuItem } from '@/components/NativeMenu'
import { useDatabase } from '@/db/provider'
import { DEFAULT_SETTINGS, loadSettings, type ServerSettings } from '@/db/settings'
import { useConnectionTest } from '@/hooks/useConnectionTest'

// The server fields, as Settings and onboarding both show them: the stored values once
// they are read, the model menu, and the connection test that picks a lone model by itself.
// onChange runs when a field that makes the loaded model stale changes.
export function useServerForm(onChange?: () => void) {
  const db = useDatabase()
  const [cfg, setCfg] = useState<ServerSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const { status, models, test, reset: resetStatus } = useConnectionTest()

  useEffect(() => {
    loadSettings(db).then((stored) => {
      setCfg(stored)
      setLoaded(true)
    })
  }, [db])

  const update = (patch: Partial<ServerSettings>) => {
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
  }

  return { cfg, setCfg, loaded, update, status, models, modelItems, onTest }
}
