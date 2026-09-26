import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useState } from 'react'

import { getLastChat, type LastChat } from '@/db/chats'
import { isContinueEnabled, isContinueHidden, setContinueHidden } from '@/db/continue'

// The chat the continue button on the home tabs opens, or null while it is turned off
// or swiped away.
export function useLastChat() {
  const db = useSQLiteContext()
  const [lastChat, setLastChat] = useState<LastChat | null>(null)

  const reload = useCallback(async () => {
    const show = (await isContinueEnabled(db)) && !(await isContinueHidden(db))
    setLastChat(show ? await getLastChat(db) : null)
  }, [db])

  const hide = () => {
    setLastChat(null)
    setContinueHidden(db, true)
  }

  return { lastChat, reload, hide }
}
