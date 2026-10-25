import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import type { MenuItem } from '@/components/overlays/NativeMenu'

import { setChatRecap, type Chat } from '@/db/chats'
import type { Message } from '@/db/messages'
import { longMemoryEnabled } from '@/db/prefs/memory'
import { loadSettings } from '@/db/prefs/settings'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { setTextDraft } from '@/lib/chat/textDraft'
import { RECAP_BATCH, RECAP_CHUNK, recapBlock, summarize } from '@/lib/chat/memory'

// The long memory of one chat or scene: the summary of what fell out of its context window
// (src/lib/chat/memory.ts), kept with the chat. `block` is what a request puts into its
// system prompt; `remember`, after a reply, sums up what the request had to leave out.
export function useLongMemory(chat: Chat) {
  const db = useDatabase()
  const chatId = chat.id
  const memory = useRef({ recap: chat.recap ?? '', upto: chat.recapUpto ?? 0 })
  const running = useRef<AbortController | null>(null)

  useEffect(() => () => running.current?.abort(), [])

  // Only a summary of lines before the newest one a request carries goes in, so a reply
  // written again further up never learns what came after it. One the user wrote by hand
  // covers nothing in particular and always goes in.
  const block = useCallback((history: { id: number }[]) => {
    const { recap, upto } = memory.current
    const last = history[history.length - 1]?.id ?? 0
    return longMemoryEnabled() && recap.trim() && upto < last ? recapBlock(recap) : ''
  }, [])

  // `kept` is how many of the latest messages of `history` the request carried; what came
  // before them and is not in the summary yet goes into it, a chunk at a time, in the
  // background. `line` writes a message as the summary should read it, or leaves it out.
  const remember = useCallback(
    (history: Message[], kept: number, line: (m: Message) => string | null) => {
      if (!longMemoryEnabled() || running.current) return
      const dropped = history.slice(0, Math.max(0, history.length - kept))
      if (dropped.filter((m) => m.id > memory.current.upto).length < RECAP_BATCH) return
      const ctrl = new AbortController()
      running.current = ctrl
      ;(async () => {
        try {
          const cfg = await loadSettings(db)
          for (;;) {
            const fresh = dropped.filter((m) => m.id > memory.current.upto)
            if (fresh.length < RECAP_BATCH || ctrl.signal.aborted) break
            const chunk = fresh.slice(0, RECAP_CHUNK)
            const lines = chunk.flatMap((m) => {
              const text = line(m)
              return text ? [text] : []
            })
            const upto = chunk[chunk.length - 1].id
            const recap = lines.length ? await summarize(cfg, memory.current.recap, lines, ctrl.signal) : memory.current.recap
            if (recap === null || ctrl.signal.aborted) break
            memory.current = { recap, upto }
            await setChatRecap(db, chatId, recap, upto)
          }
        } catch {
          // The summary is an extra; a failed one is tried again after the next reply.
        } finally {
          if (running.current === ctrl) running.current = null
        }
      })()
    },
    [db, chatId]
  )

  // The summary as the user reads and corrects it from the chat's menu.
  const recap = useCallback(() => memory.current.recap, [])
  const editRecap = useCallback(
    (text: string) => {
      memory.current = { ...memory.current, recap: text }
      setChatRecap(db, chatId, text, memory.current.upto)
    },
    [db, chatId]
  )

  return useMemo(() => ({ block, remember, recap, editRecap }), [block, remember, recap, editRecap])
}

export type LongMemory = ReturnType<typeof useLongMemory>

// "Memory" in the menu of a chat or a scene, while long memory is on or a summary is kept:
// the summary over the whole screen, to read and correct.
export function useMemoryMenu(memory: LongMemory): MenuItem[] {
  const router = useRouter()
  const { t } = useTranslation()
  if (!longMemoryEnabled() && !memory.recap().trim()) return []
  const open = () => {
    setTextDraft({ title: t('memory.title'), value: memory.recap(), placeholder: t('memory.placeholder'), onChange: memory.editRecap })
    router.push('/text-editor')
  }
  return [{ label: t('memory.menu'), systemImage: 'brain', onSelect: open }]
}
