import { useCallback, useEffect, useRef, useState } from 'react'

import type { ChatTurn } from '@/api/llm'
import type { Character } from '@/db/characters'
import { type Chat } from '@/db/chats'
import { addVariant, type Message, type MessageImage, type Thought } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/prefs/settings'
import { useConversation } from '@/hooks/chat/useConversation'
import { t } from '@/i18n'
import { selectHistory, turnTokens } from '@/lib/core/context'
import { errorMessage } from '@/lib/core/errors'
import * as Haptics from '@/lib/ui/haptics'
import { CONTINUE_NOTE, emptyReplyReason, runReplyStream, toTurn, withReplyLimit } from '@/lib/chat/replyStream'

export type ChatPhase = 'idle' | 'waiting' | 'streaming'

type RegenerateTarget = { context: Message[]; replacing: Message | null }

// What regenerating the message at `index` produces. An assistant message gets a new
// variant of itself and a user message a new variant of the reply right after it; in
// both cases the model sees only the conversation up to that point. The last user
// message gets a fresh reply instead.
export function regenerateTargetAt(history: Message[], index: number): RegenerateTarget | null {
  const message = history[index]
  if (!message) return null
  if (message.role === 'assistant') {
    // The opening greeting has nothing before it for the model to answer.
    return index > 0 ? { context: history.slice(0, index), replacing: message } : null
  }
  const next = history[index + 1]
  if (!next) return { context: history, replacing: null }
  // Two user messages in a row leave no reply to replace, and a new one cannot be
  // squeezed in between since messages are ordered by id.
  return next.role === 'assistant' ? { context: history.slice(0, index + 1), replacing: next } : null
}

export function useChat(chat: Chat, character: Character) {
  const db = useDatabase()
  const characterRef = useRef(character)
  characterRef.current = character
  const {
    store,
    storeRef,
    messages,
    messagesRef,
    setMessages,
    loaded,
    setLoaded,
    error,
    setError,
    title,
    titleRef,
    naming,
    rename,
    autoName,
    task,
    discarded,
    selectVariant,
    editMessage,
    removeMessage,
    discard,
  } = useConversation(chat, () => characterRef.current.name)
  const [draft, setDraft] = useState<string | null>(null)
  const [phase, setPhase] = useState<ChatPhase>('idle')
  // While a reply is regenerated the old one is hidden and the draft takes its place.
  const [replacingId, setReplacingId] = useState<number | null>(null)
  // What a reasoning model is thinking before the reply, shown live. The duration is
  // set once the reply itself starts, which is when the thinking is over.
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [reasoningMs, setReasoningMs] = useState<number | null>(null)

  // The latest request, so a retry repeats exactly that one.
  const lastRequest = useRef<{ id: number; guidance?: string } | 'continue' | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const rows = await store.list()
      if (!alive) return
      setMessages(rows)
      setLoaded(true)
    })()
    return () => {
      alive = false
      // A reply still streaming finishes into the store it was started for, but the
      // screen already belongs to the other one.
      task.reset()
      lastRequest.current = null
      setMessages([])
      setLoaded(false)
      setDraft(null)
      setReasoning(null)
      setReasoningMs(null)
      setPhase('idle')
      setReplacingId(null)
      setError(null)
    }
  }, [store, setMessages, setLoaded, setError])

  const generate = useCallback(
    async (history: Message[], replacing: Message | null = null, guidance?: string) => {
      const ctrl = task.start()
      setReplacingId(replacing?.id ?? null)
      setError(null)
      setPhase('waiting')
      setDraft('')
      setReasoning(null)
      setReasoningMs(null)

      const target = characterRef.current
      let reply = ''
      let keptThought: Thought | null = null
      let cutoff = false

      try {
        const cfg = await loadSettings(db)
        const system = withReplyLimit(target.systemPrompt.trim(), target.replyLimit)
        const turns = selectHistory(history.map(toTurn), turnTokens, cfg, {
          messages: cfg.chatMessages,
          system,
          maxTokens: target.maxTokens,
        })
        const streamed = await runReplyStream(
          cfg,
          {
            messages: requestTurns(system, turns, guidance),
            temperature: target.temperature,
            maxTokens: target.maxTokens,
            topP: target.topP,
            thinking: target.thinking,
          },
          ctrl.signal,
          {
            onStart: () => setPhase('streaming'),
            onFirstWords: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
            onFrame: ({ text, thought, thinkingMs }) => {
              if (storeRef.current !== store) return
              setDraft(text.trimStart())
              if (thought) setReasoning(thought.trim())
              setReasoningMs(thinkingMs)
            },
          }
        )
        // A stopped or broken stream still keeps what it had written.
        reply = streamed.text
        keptThought = streamed.thought
        cutoff = streamed.cutoff
        if (streamed.error) throw streamed.error
      } catch (err) {
        if (!ctrl.signal.aborted) setError(errorMessage(err))
      } finally {
        // An empty reply otherwise vanishes silently, as if the tap did nothing.
        if (!reply && !ctrl.signal.aborted) {
          setError((prev) => prev ?? t(emptyReplyReason({ thought: keptThought, cutoff })))
        }
        if (discarded.current.has(ctrl)) reply = ''
        const current = () => storeRef.current === store
        if (reply && replacing) {
          const updated = await store.addVariant(replacing, reply, keptThought)
          if (current()) setMessages(messagesRef.current.map((m) => (m.id === updated.id ? updated : m)))
        } else if (reply) {
          const added = await store.add('assistant', reply, { thought: keptThought })
          if (!current()) return
          const next = [...messagesRef.current, added]
          setMessages(next)
          // The first answer is where a chat gets its name. A failure here is not worth
          // an error card: the user can always ask for a title from the menu.
          if (!titleRef.current && next.filter((m) => m.role === 'user').length === 1) {
            autoName().catch(() => {})
          }
        }
        if (task.finish(ctrl)) {
          setDraft(null)
          setReasoning(null)
          setReasoningMs(null)
          setPhase('idle')
          setReplacingId(null)
        }
      }
    },
    [db, store, setMessages, autoName]
  )

  const send = useCallback(
    async (text: string, images: MessageImage[]) => {
      if (task.current()) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const sent = await store.add('user', text, { images })
      lastRequest.current = { id: sent.id }
      const history = [...messagesRef.current, sent]
      setMessages(history)
      await generate(history)
    },
    [store, generate, setMessages]
  )

  const regenerate = useCallback(
    async (id: number, guidance?: string) => {
      if (task.current()) return
      const history = messagesRef.current
      const target = regenerateTargetAt(history, history.findIndex((m) => m.id === id))
      if (!target) return
      lastRequest.current = { id, guidance }
      await generate(target.context, target.replacing, guidance)
    },
    [generate]
  )

  // With nothing typed the model takes the next turn itself: it goes on with the
  // scene or unfolds its last reply. The reply is a new message, so the previous one
  // stays as it was.
  const proceed = useCallback(async () => {
    if (task.current() || !messagesRef.current.length) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    lastRequest.current = 'continue'
    await generate(messagesRef.current, null, CONTINUE_NOTE)
  }, [generate])

  const retry = useCallback(() => {
    if (lastRequest.current === 'continue') return void proceed()
    const last = messagesRef.current[messagesRef.current.length - 1]
    const request = lastRequest.current ?? (last ? { id: last.id } : null)
    if (request) regenerate(request.id, request.guidance)
  }, [regenerate, proceed])

  const stop = task.stop

  return {
    messages,
    loaded,
    draft,
    phase,
    error,
    title,
    naming,
    replacingId,
    reasoning,
    reasoningMs,
    send,
    stop,
    regenerate,
    retry,
    proceed,
    selectVariant,
    editMessage,
    removeMessage,
    discard,
    rename,
    autoName,
  }
}

// A wish for the regenerated reply goes into the last user turn as an out-of-character
// note, a convention roleplay models know; it is sent once and never saved. It is not a
// trailing system message because many chat templates accept the system role only first.
function requestTurns(system: string, turns: ChatTurn[], guidance: string | undefined): ChatTurn[] {
  const note = guidance?.trim() ? `(OOC: ${guidance.trim()})` : ''
  const last = turns[turns.length - 1]
  const header = system
  if (last?.role === 'user') {
    if (note) {
      const content: ChatTurn['content'] =
        typeof last.content === 'string'
          ? `${last.content}\n\n${note}`
          : [...last.content, { type: 'text', text: note }]
      turns = [...turns.slice(0, -1), { ...last, content }]
    }
  } else if (last?.role === 'assistant') {
    // The turn being regenerated followed another assistant turn (e.g. one produced by
    // "continue"), so nothing ends in a user turn. Many chat templates then treat the
    // request as a prefill of that reply and close it at once, returning nothing. A
    // trailing user turn asks for a fresh reply instead of extending the old one.
    turns = [...turns, { role: 'user', content: note || CONTINUE_NOTE }]
  }
  return header ? [{ role: 'system', content: header }, ...turns] : turns
}
