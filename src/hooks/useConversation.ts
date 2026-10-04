import type { SQLiteDatabase } from 'expo-sqlite'
import { useCallback, useMemo, useRef, useState } from 'react'

import { setChatTitle, type Chat } from '@/db/chats'
import {
  addMessage,
  addVariant,
  deleteMessage,
  listMessages,
  selectVariant as storeVariant,
  updateMessage,
  type Message,
  type NewMessageExtra,
  type Role,
  type Thought,
} from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/settings'
import { useAbortable } from '@/hooks/useAbortable'
import * as Haptics from '@/lib/haptics'
import { suggestTitle } from '@/lib/titles'

// The conversation's rows in the database it was loaded from. When the database moves to
// another folder the store is rebuilt, and a reply still streaming into the old one must
// not land in the list of the new one.
export type MessageStore = {
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

// What a one-on-one chat and a room scene have in common: the list of messages and what
// can be done to a message in it, the title and asking the model for one, and cutting off
// a reply that is still being written. Generating a reply is up to the caller.
// `speakerOf` names who said a message, for the title the model is asked to write.
export function useConversation(chat: Chat, speakerOf: (message: Message) => string) {
  const chatId = chat.id
  const db = useDatabase()
  const store = useMemo(() => dbStore(db, chatId), [db, chatId])
  const storeRef = useRef(store)
  storeRef.current = store
  const [messages, setMessagesState] = useState<Message[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitleState] = useState(chat.title)
  const [naming, setNaming] = useState(false)

  const messagesRef = useRef<Message[]>([])
  const task = useAbortable()
  const discarded = useRef(new WeakSet<AbortController>())
  const titleRef = useRef(chat.title)
  const namingRef = useRef(false)
  const speakerRef = useRef(speakerOf)
  speakerRef.current = speakerOf

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
      const next = await suggestTitle(cfg, (m) => speakerRef.current(m), messagesRef.current)
      if (next) await rename(next)
      return next
    } finally {
      namingRef.current = false
      setNaming(false)
    }
  }, [db, rename])

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
    replaceMessage,
    selectVariant,
    editMessage,
    removeMessage,
    discard,
  }
}
