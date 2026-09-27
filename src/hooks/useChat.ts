import type { SQLiteDatabase } from 'expo-sqlite'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CONTEXT_WINDOW, type ChatTurn } from '@/api/llm'
import { DEFAULT_SAMPLING, type Character } from '@/db/characters'
import { setChatTitle, type Chat } from '@/db/chats'
import {
  addMessage,
  addVariant,
  deleteMessage,
  listMessages,
  newMessage,
  selectVariant as storeVariant,
  updateMessage,
  withContent,
  withNewVariant,
  withVariant,
  type Message,
  type MessageImage,
  type NewMessageExtra,
  type Role,
  type Thought,
} from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/settings'
import { useAbortable } from '@/hooks/useAbortable'
import { t } from '@/i18n'
import { errorMessage } from '@/lib/errors'
import * as Haptics from '@/lib/haptics'
import { CONTINUE_NOTE, emptyReplyReason, runReplyStream, toTurn, withReplyLimit } from '@/lib/replyStream'
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

// Where the conversation lives: the database, or for a private chat only memory, so
// nothing of it is left once the screen lets it go.
type MessageStore = {
  list(): Promise<Message[]>
  add(role: Role, content: string, extra?: NewMessageExtra): Promise<Message>
  update(message: Message, content: string): Promise<Message>
  addVariant(message: Message, content: string, thought: Thought | null): Promise<Message>
  select(message: Message, variant: number): Promise<Message>
  remove(id: number): Promise<void>
}

function dbStore(db: SQLiteDatabase, chatId: number): MessageStore {
  return {
    list: () => listMessages(db, chatId),
    add: (role, content, extra) => addMessage(db, chatId, role, content, extra),
    update: (message, content) => updateMessage(db, message, content),
    addVariant: (message, content, thought) => addVariant(db, message, content, thought),
    select: (message, variant) => storeVariant(db, message, variant),
    remove: (id) => deleteMessage(db, id),
  }
}

function memoryStore(chatId: number): MessageStore {
  let nextId = 1
  return {
    list: async () => [],
    add: async (role, content, extra) => newMessage(nextId++, chatId, role, content, extra),
    update: async (message, content) => withContent(message, content),
    addVariant: async (message, content, thought) => withNewVariant(message, content, thought),
    select: async (message, variant) => withVariant(message, variant),
    remove: async () => {},
  }
}

// A private chat talks to the bare model: no character, no greeting, no reply limit.
const PRIVATE_PROMPT =
  'You are a plain AI assistant. Answer directly and concisely, in a neutral, matter-of-fact tone, without roleplay, persona, emotions or small talk. Reply in the language of the user.'

export function useChat(chat: Chat, character: Character, { ephemeral = false } = {}) {
  const chatId = chat.id
  const db = useDatabase()
  // Switching between the real and the private chat swaps the store in place, so the
  // screen around it stays mounted and can animate the change.
  const store = useMemo(() => (ephemeral ? memoryStore(chatId) : dbStore(db, chatId)), [ephemeral, db, chatId])
  const storeRef = useRef(store)
  storeRef.current = store
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
  const task = useAbortable()
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
      const name = characterRef.current.name
      const next = await suggestTitle(cfg, () => name, messagesRef.current)
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
  }, [store, setMessages])

  const generate = useCallback(
    async (history: Message[], replacing: Message | null = null, guidance?: string) => {
      const ctrl = task.start()
      setReplacingId(replacing?.id ?? null)
      setError(null)
      setPhase('waiting')
      setDraft('')
      setReasoning(null)
      setReasoningMs(null)

      const target = ephemeral
        ? { ...DEFAULT_SAMPLING, systemPrompt: PRIVATE_PROMPT, replyLimit: null, thinking: 'auto' as const }
        : characterRef.current
      let reply = ''
      let keptThought: Thought | null = null
      let cutoff = false

      try {
        const cfg = await loadSettings(db)
        const system = withReplyLimit(target.systemPrompt.trim(), target.replyLimit)
        const turns = history.slice(-CONTEXT_WINDOW).map(toTurn)
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
          if (!ephemeral && !titleRef.current && next.filter((m) => m.role === 'user').length === 1) {
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
    [db, store, ephemeral, setMessages, autoName]
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

  const replaceMessage = useCallback(
    (next: Message) => setMessages(messagesRef.current.map((m) => (m.id === next.id ? next : m))),
    [setMessages]
  )

  const selectVariant = useCallback(
    async (id: number, variant: number) => {
      const target = messagesRef.current.find((m) => m.id === id)
      if (!target || variant < 0 || variant >= target.variants.length || variant === target.variant) return
      Haptics.selectionAsync()
      replaceMessage(await store.select(target, variant))
    },
    [store, replaceMessage]
  )

  const stop = task.stop

  const editMessage = useCallback(
    async (id: number, content: string) => {
      const target = messagesRef.current.find((m) => m.id === id)
      if (target) replaceMessage(await store.update(target, content))
    },
    [store, replaceMessage]
  )

  const removeMessage = useCallback(
    async (id: number) => {
      await store.remove(id)
      setMessages(messagesRef.current.filter((m) => m.id !== id))
      setError(null)
    },
    [store, setMessages]
  )

  // The chat is about to be deleted, so the partial reply must not be written into it.
  const discard = useCallback(() => {
    const running = task.current()
    if (!running) return
    discarded.current.add(running)
    running.abort()
  }, [task])

  return {
    messages,
    loaded,
    draft,
    phase,
    error,
    title: ephemeral ? null : title,
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
