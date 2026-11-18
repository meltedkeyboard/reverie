import { useCallback, useEffect, useRef, useState } from 'react'

import type { Message } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/prefs/settings'
import { loadSuggestionContextMode, loadSuggestionMessages, loadSuggestionTokens } from '@/db/prefs/suggestions'
import type { AsideScene } from '@/lib/chat/aside'
import { suggestReply, type SuggestionRefine } from '@/lib/chat/suggest'
import { isSuggestionOverflowed, setSuggestionOverflowed, suggestionFinishAsync } from '@/lib/ui/haptics'

// A guess at the user's next message, asked for once the characters have finished their
// turn and streamed into the field as it is written. A failed request just leaves the
// field without a suggestion.
export function useSuggestion(scene: AsideScene, messages: Message[], enabled: boolean, direction?: string | null) {
  const db = useDatabase()
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const suggestionRef = useRef<string | null>(null)
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const directionRef = useRef(direction)
  directionRef.current = direction
  const ctrlRef = useRef<AbortController | null>(null)
  const refineRef = useRef<SuggestionRefine | null>(null)
  const [refineCycle, setRefineCycle] = useState(0)
  // Lasts until the screen is left: the hook lives and dies with the chat.
  const [dismissed, setDismissed] = useState(false)

  const prevDirection = useRef(direction)
  useEffect(() => {
    if (prevDirection.current !== direction) {
      prevDirection.current = direction
      setDismissed(false)
    }
  }, [direction])

  const last = messages[messages.length - 1]
  const source = enabled && !dismissed && last?.role === 'assistant' && last.content.trim() ? last : null
  const lastSourceId = useRef<number | null>(null)

  useEffect(() => {
    if (lastSourceId.current !== source?.id) {
      lastSourceId.current = source?.id ?? null
      refineRef.current = null
    }
  }, [source?.id])

  useEffect(() => {
    setSuggestion(null)
    setSuggestionOverflowed(false)
    if (!source) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const show = (text: string | null) => {
      if (!ctrl.signal.aborted) {
        suggestionRef.current = text
        setSuggestion(text)
      }
    }
    const currentRefine = refineRef.current
    Promise.all([
      loadSettings(db),
      loadSuggestionTokens(db),
      loadSuggestionContextMode(db),
      loadSuggestionMessages(db),
    ])
      .then(([cfg, maxTokens, contextMode, messageCount]) =>
        suggestReply(
          cfg,
          maxTokens,
          contextMode,
          messageCount,
          sceneRef.current,
          messagesRef.current,
          ctrl.signal,
          show,
          directionRef.current,
          currentRefine
        )
      )
      .then((finalText) => {
        show(finalText)
        if (finalText && !ctrl.signal.aborted && isSuggestionOverflowed()) {
          suggestionFinishAsync()
        }
      })
      .catch(() => show(null))
      .finally(() => {
        setSuggestionOverflowed(false)
      })
    return () => {
      ctrl.abort()
      setSuggestionOverflowed(false)
    }
  }, [db, source?.id, source?.content, direction, refineCycle])

  // Taking a suggestion that is still streaming must stop it, or it would come back.
  const clear = useCallback(() => {
    ctrlRef.current?.abort()
    suggestionRef.current = null
    setSuggestion(null)
    setSuggestionOverflowed(false)
  }, [])

  const dismiss = useCallback(() => {
    clear()
    setDismissed(true)
  }, [clear])

  const refine = useCallback(
    (wish: string) => {
      if (!source || !wish.trim()) return
      refineRef.current = { original: suggestionRef.current ?? '', wish: wish.trim() }
      setDismissed(false)
      setRefineCycle((c) => c + 1)
    },
    [source]
  )

  return [suggestion, clear, dismiss, refine] as const
}
