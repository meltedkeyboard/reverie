import { useState } from 'react'

import { testConnection } from '@/api/llm'
import type { ServerSettings } from '@/db/prefs/settings'
import { useTranslation } from '@/i18n'
import { errorMessage } from '@/lib/core/errors'
import * as Haptics from '@/lib/ui/haptics'

type Status = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' | 'error'; text: string }

// The "test connection" button of the server setup, shared by Settings and onboarding:
// asks the server for its models and reports what came back.
export function useConnectionTest() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [models, setModels] = useState<string[]>([])

  const test = async (cfg: ServerSettings) => {
    setStatus({ kind: 'testing' })
    try {
      const found = await testConnection(cfg)
      setModels(found)
      setStatus({
        kind: 'ok',
        text: found.length ? t('settings.connectedWithModels', { count: found.length }) : t('settings.connected'),
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      return found
    } catch (err) {
      setModels([])
      setStatus({ kind: 'error', text: errorMessage(err) })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return []
    }
  }

  // After the address or the key changed: the models listed were another server's.
  const reset = () => {
    setStatus({ kind: 'idle' })
    setModels([])
  }

  return { status, models, test, reset }
}
