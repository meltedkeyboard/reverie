import { useCallback, useState } from 'react'

import { getLastChat, type LastChat } from '@/db/chats'
import { getLastOpened, isContinueByVisit, isContinueEnabled, isContinueHidden, setContinueHidden, type ContinueKind } from '@/db/continue'
import { useDatabase } from '@/db/provider'

// The chat the continue button on a home tab opens: the last one with a character on
// Characters, the last scene on Rooms. Null while the button is turned off or swiped away.
export function useLastChat(kind: ContinueKind) {
  const db = useDatabase()
  const [lastChat, setLastChat] = useState<LastChat | null>(null)

  const reload = useCallback(async () => {
    const show = (await isContinueEnabled(db)) && !(await isContinueHidden(db, kind))
    if (!show) return setLastChat(null)
    const openedId = (await isContinueByVisit(db)) ? await getLastOpened(db, kind) : null
    setLastChat(await getLastChat(db, kind, openedId))
  }, [db, kind])

  const hide = () => {
    setLastChat(null)
    setContinueHidden(db, kind, true)
  }

  return { lastChat, reload, hide }
}
