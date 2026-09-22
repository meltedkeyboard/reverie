import * as Haptics from 'expo-haptics'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useRef, useState } from 'react'

import { CONTEXT_WINDOW, streamChat, type ChatTurn, type ContentPart } from '@/api/llm'
import type { Character } from '@/db/characters'
import { setChatTitle, type Chat } from '@/db/chats'
import {
  addMessage,
  addVariant,
  deleteMessage,
  listMessages,
  selectVariant as storeVariant,
  updateMessage,
  type Message,
  type MessageImage,
  type Thought,
} from '@/db/messages'
import { loadSettings } from '@/db/settings'
import { t } from '@/i18n'
import { imageDataUrl } from '@/lib/images'
import { suggestTitle } from '@/lib/titles'

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
  const chatId = chat.id
  const db = useSQLiteContext()
  const [messages, setMessagesState] = useState<Message[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [phase, setPhase] = useState<ChatPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [title, setTitleState] = useState(chat.title)
  const [naming, setNaming] = useState(false)
  // While a reply is regenerated the old one is hidden and the draft takes its place.
  const [replacingId, setReplacingId] = useState<number | null>(null)
  // What a reasoning model is thinking before the reply, shown live. The duration is
  // set once the reply itself starts, which is when the thinking is over.
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [reasoningMs, setReasoningMs] = useState<number | null>(null)

  const messagesRef = useRef<Message[]>([])
  const characterRef = useRef(character)
  characterRef.current = character
  const abortRef = useRef<AbortController | null>(null)
  const discarded = useRef(new WeakSet<AbortController>())
  const titleRef = useRef(chat.title)
  const namingRef = useRef(false)
  // The latest request, so a retry repeats exactly that one.
  const lastRequest = useRef<{ id: number; guidance?: string } | 'continue' | null>(null)

  const setMessages = useCallback((next: Message[]) => {
    messagesRef.current = next
    setMessagesState(next)
  }, [])

  const rename = useCallback(
    async (next: string | null) => {
      const saved = await setChatTitle(db, chatId, next)
      titleRef.current = saved
      setTitleState(saved)
    },
    [db, chatId]
  )

  const autoName = useCallback(async () => {
    if (namingRef.current) return null
    namingRef.current = true
    setNaming(true)
    try {
      const cfg = await loadSettings(db)
      const next = await suggestTitle(cfg, characterRef.current.name, messagesRef.current)
      if (next) await rename(next)
      return next
    } finally {
      namingRef.current = false
      setNaming(false)
    }
  }, [db, rename])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const rows = await listMessages(db, chatId)
      if (!alive) return
      setMessages(rows)
      setLoaded(true)
    })()
    return () => {
      alive = false
      abortRef.current?.abort()
    }
  }, [db, chatId, setMessages])

  const generate = useCallback(
    async (history: Message[], replacing: Message | null = null, guidance?: string) => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setReplacingId(replacing?.id ?? null)
      setError(null)
      setPhase('waiting')
      setDraft('')
      setReasoning(null)
      setReasoningMs(null)

      const target = characterRef.current
      let text = ''
      let thought = ''
      let thinkingSince = 0
      let thinkingMs: number | null = null
      let frame = 0
      // Chunks arrive faster than the screen refreshes, so renders are batched per frame.
      const flush = () => {
        frame = 0
        setDraft(text.trimStart())
        if (thought) setReasoning(thought.trim())
      }

      try {
        const cfg = await loadSettings(db)
        const system = withReplyLimit(target.systemPrompt.trim(), target.replyLimit)
        const turns = history.slice(-CONTEXT_WINDOW).map(toTurn)
        const stream = streamChat(
          cfg,
          {
            messages: requestTurns(system, turns, guidance),
            temperature: target.temperature,
            maxTokens: target.maxTokens,
            topP: target.topP,
            thinking: target.thinking,
          },
          ctrl.signal
        )

        for await (const part of stream) {
          if (part.kind === 'reasoning') {
            if (!thought) {
              setPhase('streaming')
              thinkingSince = Date.now()
            }
            thought += part.text
            if (!frame) frame = requestAnimationFrame(flush)
            continue
          }
          if (thought && thinkingMs === null) {
            thinkingMs = Date.now() - thinkingSince
            setReasoningMs(thinkingMs)
          }
          const wasEmpty = !text.trim()
          text += part.text
          if (wasEmpty && text.trim()) {
            setPhase('streaming')
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
          }
          if (!frame) frame = requestAnimationFrame(flush)
        }
      } catch (err) {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      } finally {
        // An empty reply otherwise vanishes silently, as if the tap did nothing.
        if (!text.trim() && !ctrl.signal.aborted) {
          setError((prev) => prev ?? t('chat.emptyReply'))
        }
        if (frame) cancelAnimationFrame(frame)
        const reply = discarded.current.has(ctrl) ? '' : text.trim()
        const keptThought: Thought | null = thought.trim()
          ? { text: thought.trim(), ms: thinkingMs ?? Date.now() - thinkingSince }
          : null
        if (reply && replacing) {
          const updated = await addVariant(db, replacing, reply, keptThought)
          setMessages(messagesRef.current.map((m) => (m.id === updated.id ? updated : m)))
        } else if (reply) {
          const added = await addMessage(db, chatId, 'assistant', reply, { thought: keptThought })
          const next = [...messagesRef.current, added]
          setMessages(next)
          // The first answer is where a chat gets its name. A failure here is not worth
          // an error card: the user can always ask for a title from the menu.
          if (!titleRef.current && next.filter((m) => m.role === 'user').length === 1) {
            autoName().catch(() => {})
          }
        }
        if (abortRef.current === ctrl) {
          abortRef.current = null
          setDraft(null)
          setReasoning(null)
          setReasoningMs(null)
          setPhase('idle')
          setReplacingId(null)
        }
      }
    },
    [db, chatId, setMessages, autoName]
  )

  const send = useCallback(
    async (text: string, image: MessageImage | null) => {
      if (abortRef.current) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const sent = await addMessage(db, chatId, 'user', text, { image })
      lastRequest.current = { id: sent.id }
      const history = [...messagesRef.current, sent]
      setMessages(history)
      await generate(history)
    },
    [db, chatId, generate, setMessages]
  )

  const regenerate = useCallback(
    async (id: number, guidance?: string) => {
      if (abortRef.current) return
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
    if (abortRef.current || !messagesRef.current.length) return
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

  const replaceMessage = useCallback(
    (next: Message) => setMessages(messagesRef.current.map((m) => (m.id === next.id ? next : m))),
    [setMessages]
  )

  const selectVariant = useCallback(
    async (id: number, variant: number) => {
      const target = messagesRef.current.find((m) => m.id === id)
      if (!target || variant < 0 || variant >= target.variants.length || variant === target.variant) return
      Haptics.selectionAsync()
      replaceMessage(await storeVariant(db, target, variant))
    },
    [db, replaceMessage]
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const editMessage = useCallback(
    async (id: number, content: string) => {
      const target = messagesRef.current.find((m) => m.id === id)
      if (target) replaceMessage(await updateMessage(db, target, content))
    },
    [db, replaceMessage]
  )

  const removeMessage = useCallback(
    async (id: number) => {
      await deleteMessage(db, id)
      setMessages(messagesRef.current.filter((m) => m.id !== id))
      setError(null)
    },
    [db, setMessages]
  )

  // The chat is about to be deleted, so the partial reply must not be written into it.
  const discard = useCallback(() => {
    const running = abortRef.current
    if (!running) return
    discarded.current.add(running)
    running.abort()
  }, [])

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

// Without a cap the system prompt goes out exactly as written. With one, an instruction
// is appended asking the model to keep the reply within that many paragraphs; nothing
// after the fact trims what comes back; a model that ignores it just writes long.
function withReplyLimit(system: string, limit: number | null): string {
  if (!limit) return system
  const rule = `Keep your reply to at most ${limit} ${limit === 1 ? 'paragraph' : 'paragraphs'}.`
  return system ? `${system}\n\n${rule}` : rule
}

const CONTINUE_NOTE =
  'Continue the roleplay from where it stopped: develop your last reply further or move the scene forward. Do not repeat what was already said and do not speak for the user.'

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

function toTurn(m: Message): ChatTurn {
  if (!m.image) return { role: m.role, content: m.content }
  const parts: ContentPart[] = [{ type: 'image_url', image_url: { url: imageDataUrl(m.image) } }]
  if (m.content.trim()) parts.push({ type: 'text', text: m.content })
  return { role: m.role, content: parts }
}
