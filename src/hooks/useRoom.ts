import { useCallback, useEffect, useRef, useState } from 'react'

import { type Chat } from '@/db/chats'
import { addMessage, addVariant, listMessages, type Message, type MessageImage, type MessageKind, type Thought } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { setMemberPresent, type Room, type RoomMember } from '@/db/rooms'
import { loadSettings } from '@/db/settings'
import { useConversation } from '@/hooks/useConversation'
import { t } from '@/i18n'
import { errorMessage } from '@/lib/errors'
import * as Haptics from '@/lib/haptics'
import { emptyReplyReason, runReplyStream } from '@/lib/replyStream'
import { absentIds, rollEavesdrop } from '@/lib/room/audience'
import { askDirector, askMovement, type Movement } from '@/lib/room/director'
import {
  applyDirector,
  detectAddressees,
  followUps,
  movementCue,
  nextSpeaker,
  planTurn,
  turnFor,
  type Planned,
  type TurnPlan,
} from '@/lib/room/floor'
import { buildRoomRequest, cleanLine, userNameOf } from '@/lib/room/prompt'

// 'directing' is the short wait while the director decides who speaks, 'staging' while
// it checks whether a line walked someone out of the scene or in.
export type RoomPhase = 'idle' | 'directing' | 'staging' | 'waiting' | 'streaming'

export type RoomDraft = {
  speakerId: number
  kind: Exclude<MessageKind, 'narration'>
  addressees: number[] | null
  audience: number[] | null
  text: string
  reasoning: string | null
  reasoningMs: number | null
}

export type SendOptions = {
  // Characters the user speaks to; empty is the whole room.
  addressees: number[]
  // Only the addressees hear it (and whoever overhears).
  whisper: boolean
  // The user describes the scene instead of speaking.
  narration: boolean
}

type Failure = { kind: 'queue'; queue: Planned[] } | { kind: 'regenerate'; id: number; guidance?: string }

type Spoken = { line: Message | null; ok: boolean }

// `onMembersChange` hears of people walking in and out, which the room does by itself
// too, and must pass the new cast back in as `members`.
export function useRoom(chat: Chat, room: Room, members: RoomMember[], onMembersChange: (next: RoomMember[]) => void) {
  const chatId = chat.id
  const db = useDatabase()
  const membersRef = useRef(members)
  membersRef.current = members
  const nameOf = useCallback((id: number | null) => {
    return membersRef.current.find((m) => m.characterId === id)?.character.name ?? t('room.deletedCharacter')
  }, [])
  const {
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
  } = useConversation(chat, (m) => (m.kind === 'narration' ? t('room.narrator') : nameOf(m.speakerId)))
  const [draft, setDraft] = useState<RoomDraft | null>(null)
  const [phase, setPhase] = useState<RoomPhase>('idle')
  const [replacingId, setReplacingId] = useState<number | null>(null)
  // Who is lined up to speak after the current line.
  const [queue, setQueue] = useState<Planned[]>([])
  const [auto, setAuto] = useState<{ done: number; total: number } | null>(null)

  const roomRef = useRef(room)
  roomRef.current = room
  const castRef = useRef(onMembersChange)
  castRef.current = onMembersChange
  const failure = useRef<Failure | null>(null)

  useEffect(() => {
    let alive = true
    listMessages(db, chatId).then((rows) => {
      if (!alive) return
      setMessages(rows)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [db, chatId, setMessages, setLoaded])

  // A line from the narrator, e.g. someone walking in.
  const narrate = useCallback(
    async (text: string, absent: number[]) => {
      const added = await addMessage(db, chatId, 'assistant', text, { kind: 'narration', absent })
      setMessages([...messagesRef.current, added])
    },
    [db, chatId, setMessages]
  )

  // Walking in or out is told by the narrator, so everyone in the scene knows. The one
  // leaving still hears their own exit; the one coming in hears their entrance and
  // nothing of what happened while they were away.
  const setPresent = useCallback(
    async (characterId: number, present: boolean) => {
      const member = membersRef.current.find((m) => m.characterId === characterId)
      if (!member || member.present === present) return
      const name = member.character.name
      if (!present) await narrate(t('room.leaves', { name }), absentIds(membersRef.current))
      await setMemberPresent(db, roomRef.current.id, characterId, present)
      const next = membersRef.current.map((m) => (m.characterId === characterId ? { ...m, present } : m))
      // Set here as well: the queue goes on with the new cast before the screen re-renders.
      membersRef.current = next
      castRef.current(next)
      if (present) await narrate(t('room.enters', { name }), absentIds(next))
    },
    [db, narrate]
  )

  // After a line that looks like someone walks out or in, the director says who, and the
  // narrator records it. Returns who came in.
  const stage = useCallback(
    async (ctrl: AbortController, line: Message) => {
      if (!roomRef.current.director || !movementCue(line.content, membersRef.current)) return []
      setPhase('staging')
      let moved: Movement | null = null
      try {
        const cfg = await loadSettings(db)
        moved = await askMovement(
          cfg,
          { line, members: membersRef.current, history: messagesRef.current, userName: userNameOf(roomRef.current) },
          ctrl.signal
        )
      } catch {
        return []
      }
      if (!moved || ctrl.signal.aborted || discarded.current.has(ctrl)) return []
      for (const id of moved.leave) await setPresent(id, false)
      for (const id of moved.enter) await setPresent(id, true)
      if (moved.leave.length || moved.enter.length) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      return moved.enter
    },
    [db, setPresent]
  )

  // In open floor whoever just walked in gets to react to what they walked into, as long
  // as the chain has room.
  const arrivals = useCallback((entered: number[], queued: Planned[], said: number): Planned[] => {
    if (roomRef.current.floor !== 'open') return []
    const room = roomRef.current.maxChain - said - queued.length
    const last = messagesRef.current[messagesRef.current.length - 1]
    return entered
      .filter((id) => !queued.some((p) => p.characterId === id))
      .slice(0, Math.max(0, room))
      .map((id) => turnFor(last, id))
  }, [])

  // Writes one character's line: a new message, or with `replacing` a new variant of it.
  const speak = useCallback(
    async (ctrl: AbortController, planned: Planned, history: Message[], replacing?: Message, guidance?: string): Promise<Spoken> => {
      const speaker = membersRef.current.find((m) => m.characterId === planned.characterId)
      if (!speaker) return { line: null, ok: false }
      const name = speaker.character.name
      const others = [
        ...membersRef.current.filter((m) => m !== speaker).map((m) => m.character.name),
        userNameOf(roomRef.current),
      ]
      setReplacingId(replacing?.id ?? null)
      setPhase('waiting')
      setDraft({ ...planned, speakerId: planned.characterId, text: '', reasoning: null, reasoningMs: null })

      let reply = ''
      let failed: unknown = null
      let thought: Thought | null = null
      let cutoff = false
      try {
        const cfg = await loadSettings(db)
        const req = buildRoomRequest({
          speaker,
          room: roomRef.current,
          members: membersRef.current,
          history,
          planned,
          guidance,
          window: cfg,
        })
        const streamed = await runReplyStream(cfg, req, ctrl.signal, {
          onStart: () => setPhase('streaming'),
          onFirstWords: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
          onFrame: (frame) =>
            setDraft((prev) =>
              prev && {
                ...prev,
                text: cleanLine(frame.text.trimStart(), name, others),
                reasoning: frame.thought ? frame.thought.trim() : null,
                reasoningMs: frame.thinkingMs,
              }
            ),
        })
        reply = cleanLine(streamed.text, name, others).trim()
        thought = streamed.thought
        cutoff = streamed.cutoff
        failed = streamed.error
      } catch (err) {
        failed = err
      }
      const aborted = ctrl.signal.aborted
      if (failed && !aborted) setError(errorMessage(failed))
      else if (!reply && !aborted) setError(t(emptyReplyReason({ thought, cutoff })))
      if (discarded.current.has(ctrl)) return { line: null, ok: false }
      const ok = Boolean(reply) && !failed && !aborted

      if (reply && replacing) {
        const updated = await addVariant(db, replacing, reply, thought)
        setMessages(messagesRef.current.map((m) => (m.id === updated.id ? updated : m)))
        return { line: updated, ok }
      }
      if (!reply) return { line: null, ok }
      const added = await addMessage(db, chatId, 'assistant', reply, {
        thought,
        speakerId: speaker.characterId,
        kind: planned.kind,
        addressees: detectAddressees(reply, speaker.characterId, membersRef.current, planned.addressees),
        audience: planned.audience,
        overheard: rollEavesdrop(planned.audience, membersRef.current, speaker.characterId),
        absent: absentIds(membersRef.current),
      })
      setMessages([...messagesRef.current, added])
      return { line: added, ok }
    },
    [db, chatId, setMessages]
  )

  // Asks the director only when the plan leaves the choice open and the room allows it.
  const resolve = useCallback(
    async (ctrl: AbortController, plan: TurnPlan, trigger: Message | undefined): Promise<Planned[]> => {
      if (!plan.ambiguous || !trigger || !roomRef.current.director) return plan.queue
      setPhase('directing')
      try {
        const cfg = await loadSettings(db)
        const picks = await askDirector(
          cfg,
          {
            ambiguity: plan.ambiguous,
            members: membersRef.current,
            history: messagesRef.current,
            userName: userNameOf(roomRef.current),
            answering: plan.queue.map((p) => p.characterId),
          },
          ctrl.signal
        )
        return picks ? applyDirector(plan, picks, trigger) : plan.queue
      } catch {
        return []
      }
    },
    [db]
  )

  // Says the planned lines one after another. In open floor every line may pull in
  // whoever it calls by name. A failed line stops the rest, kept for a retry.
  const runQueue = useCallback(
    async (ctrl: AbortController, planned: Planned[]) => {
      const pending = [...planned]
      let said = 0
      while (pending.length && !ctrl.signal.aborted) {
        const next = pending.shift()!
        setQueue([...pending])
        // Someone who walked out mid-turn has nothing more to say here.
        if (!membersRef.current.some((m) => m.characterId === next.characterId && m.present)) continue
        const { line, ok } = await speak(ctrl, next, messagesRef.current)
        if (!ok) {
          if (!ctrl.signal.aborted) failure.current = { kind: 'queue', queue: line ? pending : [next, ...pending] }
          return false
        }
        said++
        if (!line) continue
        const entered = await stage(ctrl, line)
        if (roomRef.current.floor === 'open') {
          pending.push(...followUps(line, membersRef.current, pending, said, roomRef.current.maxChain))
          pending.push(...arrivals(entered, pending, said))
        }
      }
      return true
    },
    [speak, stage, arrivals]
  )

  const settle = useCallback(
    (ctrl: AbortController) => {
      if (!task.finish(ctrl)) return
      setDraft(null)
      setPhase('idle')
      setQueue([])
      setReplacingId(null)
      setAuto(null)
    },
    [task]
  )

  const begin = useCallback(() => {
    const ctrl = task.start()
    failure.current = null
    setError(null)
    return ctrl
  }, [task])

  const maybeName = useCallback(() => {
    const all = messagesRef.current
    const users = all.filter((m) => m.role === 'user').length
    if (!titleRef.current && users === 1 && all.some((m) => m.role === 'assistant' && m.speakerId !== null)) {
      autoName().catch(() => {})
    }
  }, [autoName])

  const send = useCallback(
    async (text: string, images: MessageImage[], options: SendOptions) => {
      if (task.current()) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const narration = options.narration
      const addressees = narration || !options.addressees.length ? null : options.addressees
      const audience = options.whisper && addressees ? addressees : null
      const sent = await addMessage(db, chatId, 'user', text, {
        images,
        kind: narration ? 'narration' : 'say',
        addressees,
        audience,
        overheard: rollEavesdrop(audience, membersRef.current, null),
        absent: absentIds(membersRef.current),
      })
      const history = [...messagesRef.current, sent]
      setMessages(history)
      const ctrl = begin()
      try {
        // "Денис, выйди" changes nothing yet, but "*Денис уходит на кухню*" from the
        // narrator does, and before anyone answers.
        const entered = await stage(ctrl, sent)
        const plan = planTurn({
          mode: roomRef.current.floor,
          trigger: sent,
          addressees: addressees ?? [],
          members: membersRef.current,
          history: messagesRef.current,
          maxChain: roomRef.current.maxChain,
        })
        const planned = await resolve(ctrl, plan, sent)
        await runQueue(ctrl, [...planned, ...arrivals(entered, planned, 0)])
        maybeName()
      } finally {
        settle(ctrl)
      }
    },
    [db, chatId, task, begin, stage, resolve, arrivals, runQueue, settle, setMessages, maybeName]
  )

  // With nothing typed, the scene goes on by itself for one line.
  const proceed = useCallback(async () => {
    if (task.current()) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const ctrl = begin()
    try {
      const history = messagesRef.current
      const planned = await resolve(ctrl, nextSpeaker(history, membersRef.current), history[history.length - 1])
      await runQueue(ctrl, planned.slice(0, 1))
    } finally {
      settle(ctrl)
    }
  }, [task, begin, resolve, runQueue, settle])

  // This character takes the next turn, even one who only listens.
  const nudge = useCallback(
    async (characterId: number) => {
      if (task.current()) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const ctrl = begin()
      try {
        const history = messagesRef.current
        await runQueue(ctrl, [turnFor(history[history.length - 1], characterId)])
      } finally {
        settle(ctrl)
      }
    },
    [task, begin, runQueue, settle]
  )

  // The characters talk among themselves for `total` lines, or until stopped.
  const autoplay = useCallback(
    async (total: number) => {
      if (task.current()) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const ctrl = begin()
      setAuto({ done: 0, total })
      try {
        for (let done = 0; done < total && !ctrl.signal.aborted; done++) {
          const history = messagesRef.current
          const planned = await resolve(ctrl, nextSpeaker(history, membersRef.current), history[history.length - 1])
          if (!planned.length || !(await runQueue(ctrl, planned.slice(0, 1)))) break
          setAuto({ done: done + 1, total })
        }
      } finally {
        settle(ctrl)
      }
    },
    [task, begin, resolve, runQueue, settle]
  )

  const regenerate = useCallback(
    async (id: number, guidance?: string) => {
      if (task.current()) return
      const history = messagesRef.current
      const index = history.findIndex((m) => m.id === id)
      const target = history[index]
      if (!target || target.role !== 'assistant' || target.speakerId === null || target.kind === 'narration') return
      const context = history.slice(0, index)
      const planned: Planned = {
        ...turnFor(context[context.length - 1], target.speakerId),
        kind: target.kind,
        audience: target.audience,
        cue: undefined,
      }
      const ctrl = begin()
      try {
        const { ok } = await speak(ctrl, planned, context, target, guidance)
        if (!ok && !ctrl.signal.aborted) failure.current = { kind: 'regenerate', id, guidance }
      } finally {
        settle(ctrl)
      }
    },
    [task, begin, speak, settle]
  )

  const retry = useCallback(async () => {
    const failed = failure.current
    if (!failed) return
    if (failed.kind === 'regenerate') return regenerate(failed.id, failed.guidance)
    if (task.current()) return
    const ctrl = begin()
    try {
      await runQueue(ctrl, failed.queue)
    } finally {
      settle(ctrl)
    }
  }, [task, begin, runQueue, settle, regenerate])

  const stop = useCallback(() => {
    setQueue([])
    task.stop()
  }, [task])

  return {
    messages,
    loaded,
    draft,
    phase,
    error,
    title,
    naming,
    replacingId,
    queue,
    auto,
    send,
    stop,
    proceed,
    nudge,
    autoplay,
    setPresent,
    regenerate,
    retry,
    selectVariant,
    editMessage,
    removeMessage,
    discard,
    rename,
    autoName,
  }
}
