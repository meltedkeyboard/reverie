import { useCallback, useEffect, useRef, useState } from 'react'

import type { Message } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/settings'
import type { AsideScene } from '@/lib/aside'
import { suggestReply } from '@/lib/suggest'

// A guess at the user's next message, asked for once the characters have finished their
// turn and streamed into the field as it is written. A failed request just leaves the
// field without a suggestion.
export function useSuggestion(scene: AsideScene, messages: Message[], enabled: boolean) {
  const db = useDatabase()
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const ctrlRef = useRef<AbortController | null>(null)
  // Lasts until the screen is left: the hook lives and dies with the chat.
  const [dismissed, setDismissed] = useState(false)

  const last = messages[messages.length - 1]
  const source = enabled && !dismissed && last?.role === 'assistant' && last.content.trim() ? last : null

  useEffect(() => {
    setSuggestion(null)
    if (!source) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const show = (text: string | null) => {
      if (!ctrl.signal.aborted) setSuggestion(text)
    }
    loadSettings(db)
      .then((cfg) => suggestReply(cfg, sceneRef.current, messagesRef.current, ctrl.signal, show))
      .then(show)
      .catch(() => show(null))
    return () => ctrl.abort()
  }, [db, source?.id, source?.content])

  // Taking a suggestion that is still streaming must stop it, or it would come back.
  const clear = useCallback(() => {
    ctrlRef.current?.abort()
    setSuggestion(null)
  }, [])
  const dismiss = useCallback(() => {
    clear()
    setDismissed(true)
  }, [clear])
  return [suggestion, clear, dismiss] as const
}
