import { useCallback, useRef, useState } from 'react'

import type { Message, MessageImage } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/prefs/settings'
import { useAbortable } from '@/hooks/util/useAbortable'
import type { ChatPhase } from '@/hooks/chat/useChat'
import { t } from '@/i18n'
import { buildAsideRequest, type AsideQuestion, type AsideScene, type AsideTurn } from '@/lib/chat/aside'
import { errorMessage } from '@/lib/core/errors'
import * as Haptics from '@/lib/ui/haptics'
import { emptyReplyReason, runReplyStream, type ReplyFrame } from '@/lib/chat/replyStream'

// A private thread with the model beside the scene, like /btw: it reads the chat but
// nothing asked or answered here is saved or ever reaches the characters. The thread
// lives in memory until reset.
export function useAside(scene: AsideScene, history: Message[]) {
  const db = useDatabase()
  const task = useAbortable()
  const [turns, setTurns] = useState<AsideTurn[]>([])
  // The question being answered, or the one that failed and can be asked again.
  const [pending, setPending] = useState<AsideQuestion | null>(null)
  const [draft, setDraft] = useState<ReplyFrame | null>(null)
  const [phase, setPhase] = useState<ChatPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const turnsRef = useRef(turns)
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const historyRef = useRef(history)
  historyRef.current = history

  const ask = useCallback(
    async (text: string, images: MessageImage[] = []) => {
      const question = { text: text.trim(), images }
      if ((!question.text && !images.length) || task.current()) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const ctrl = task.start()
      setPending(question)
      setError(null)
      setPhase('waiting')
      setDraft(null)
      let streamed: Awaited<ReturnType<typeof runReplyStream>> | null = null
      try {
        const cfg = await loadSettings(db)
        const req = buildAsideRequest(sceneRef.current, historyRef.current, turnsRef.current, question)
        streamed = await runReplyStream(cfg, req, ctrl.signal, {
          onStart: () => setPhase('streaming'),
          onFrame: setDraft,
        })
        if (streamed.error) throw streamed.error
      } catch (err) {
        if (!ctrl.signal.aborted) setError(errorMessage(err))
      } finally {
        // A reset while streaming has already thrown the thread away.
        if (task.finish(ctrl)) {
          const answer = streamed?.text ?? ''
          if (answer) {
            turnsRef.current = [...turnsRef.current, { question, answer, thought: streamed?.thought ?? null }]
            setTurns(turnsRef.current)
            setPending(null)
          } else if (ctrl.signal.aborted) {
            setPending(null)
          } else {
            setError((prev) => prev ?? t(emptyReplyReason(streamed)))
          }
          setDraft(null)
          setPhase('idle')
        }
      }
    },
    [db, task]
  )

  const retry = useCallback(() => {
    if (pending) ask(pending.text, pending.images)
  }, [pending, ask])

  const reset = useCallback(() => {
    task.reset()
    turnsRef.current = []
    setTurns([])
    setPending(null)
    setDraft(null)
    setPhase('idle')
    setError(null)
  }, [task])

  return { turns, pending, draft, phase, error, ask, retry, stop: task.stop, reset }
}
