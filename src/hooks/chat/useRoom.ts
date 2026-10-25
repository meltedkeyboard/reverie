import { useCallback, useEffect, useRef, useState } from 'react'

import type { ThinkingMode } from '@/db/characters'
import { setChatThinking, setSceneState, type Chat } from '@/db/chats'
import { getPersona, setChatPersona, onPersonasChanged, type Persona } from '@/db/personas'
import { addMessage, addVariant, listMessages, type Message, type MessageImage, type MessageKind, type Thought } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { setMemberBonds, setMemberPresent, type Room, type RoomMember } from '@/db/rooms'
import { loadSettings } from '@/db/prefs/settings'
import { longMemoryEnabled } from '@/db/prefs/memory'
import { useConversation } from '@/hooks/chat/useConversation'
import { useLongMemory } from '@/hooks/chat/useLongMemory'
import { useDirection } from '@/hooks/chat/useDirection'
import { loreFor } from '@/db/lorebooks'
import { loreBlock } from '@/lib/chat/lore'
import { selectHistory, turnTokens } from '@/lib/core/context'
import { tokenLimit } from '@/api/llm'
import { toTurn } from '@/lib/chat/replyStream'
import { t } from '@/i18n'
import { errorMessage } from '@/lib/core/errors'
import * as Haptics from '@/lib/ui/haptics'
import { emptyReplyReason, runReplyStream } from '@/lib/chat/replyStream'
import { absentIds, hearing, rollEavesdrop } from '@/lib/chat/room/audience'
import { askChronicle, askDirector, askEvent, askMovement, type Movement } from '@/lib/chat/room/director'
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
} from '@/lib/chat/room/floor'
import { buildRoomRequest, cleanLine, userNameOf } from '@/lib/chat/room/prompt'

// 'directing' is the short wait while the director decides who speaks, 'staging' while
// it checks whether a line walked someone out of the scene or in, 'plotting' while the
// narrator makes up an event.
export type RoomPhase = 'idle' | 'directing' | 'staging' | 'plotting' | 'waiting' | 'streaming'

// The director notes where the scene stands and whose feelings changed every so many lines.
const CHRONICLE_EVERY = 8
// The narrator's event comes no sooner than this many lines after the last one, and then
// after a turn with this chance at the room's full plot setting.
const EVENT_GAP = 6
const EVENT_CHANCE = 0.4

export type RoomDraft = {
  speakerId: number
  kind: Exclude<MessageKind, 'narration'>
  addressees: number[] | null
  audience: number[] | null
  text: string
  reasoning: string | null
  reasoningMs: number | null
  // The wish a regenerated line was asked for with, shown above it as it streams.
  refine: string | null
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
    removeRefine,
    removeVariant,
    removeMessage,
    discard,
  } = useConversation(chat, (m) => (m.kind === 'narration' ? t('room.narrator') : nameOf(m.speakerId)))
  const memory = useLongMemory(chat)
  const direction = useDirection(chat)
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
  // Where the scene stands, and how many lines it had when the director last noted it and
  // when the narrator last brought in an event.
  const [sceneState, setSceneStateValue] = useState(chat.sceneState ?? '')
  const sceneStateRef = useRef(sceneState)
  sceneStateRef.current = sceneState
  const chronicledAt = useRef(0)
  const eventAt = useRef(0)
  const chronicling = useRef<AbortController | null>(null)

  const [chatThinking, setChatThinkingState] = useState<ThinkingMode | null>(chat.thinking ?? null)
  const chatThinkingRef = useRef(chatThinking)
  chatThinkingRef.current = chatThinking

  const [personaId, setPersonaId] = useState<number | null>(chat.personaId ?? null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const personaRef = useRef<Persona | null>(null)
  personaRef.current = persona

  useEffect(() => {
    setPersonaId(chat.personaId ?? null)
  }, [chat.id, chat.personaId])

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!personaId) {
        if (alive) setPersona(null)
        return
      }
      const found = await getPersona(db, personaId)
      if (alive) setPersona(found)
    }
    load()
    const unsub = onPersonasChanged(load)
    return () => {
      alive = false
      unsub()
    }
  }, [db, personaId])

  const selectPersona = useCallback(
    async (id: number | null) => {
      setPersonaId(id)
      await setChatPersona(db, chat.id, id)
    },
    [db, chat.id]
  )

  useEffect(() => {
    setChatThinkingState(chat.thinking ?? null)
  }, [chat.id, chat.thinking])

  const modes = new Set(members.map((m) => m.character.thinking))
  const defaultMode: ThinkingMode = modes.size === 1 ? [...modes][0] : 'auto'
  const thinking = chatThinking !== null ? chatThinking === 'on' : defaultMode === 'on'

  const toggleThinking = useCallback(
    async (on: boolean) => {
      const mode: ThinkingMode = on ? 'on' : 'off'
      setChatThinkingState(mode)
      await setChatThinking(db, chat.id, mode)
    },
    [db, chat.id]
  )

  useEffect(() => {
    let alive = true
    listMessages(db, chatId).then((rows) => {
      if (!alive) return
      chronicledAt.current = rows.length
      eventAt.current = rows.length
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
      return added
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
        userNameOf(roomRef.current, personaRef.current),
      ]
      setReplacingId(replacing?.id ?? null)
      setPhase('waiting')
      const refine = guidance?.trim() || null
      setDraft({ ...planned, speakerId: planned.characterId, text: '', reasoning: null, reasoningMs: null, refine })

      let reply = ''
      let failed: unknown = null
      let thought: Thought | null = null
      let cutoff = false
      try {
        const cfg = await loadSettings(db)
        // The speaker's own lorebooks and the room's, by what they heard of the latest lines.
        const heard = history.filter((m) => hearing(m, speaker.characterId))
        const lore = loreBlock(await loreFor(db, { characterIds: [speaker.characterId], roomId: roomRef.current.id }), (depth) =>
          heard
            .slice(-depth)
            .map((m) => m.content)
            .join('\n')
        )
        const req = buildRoomRequest({
          speaker,
          room: roomRef.current,
          members: membersRef.current,
          history,
          planned,
          guidance,
          window: cfg,
          thinking: chatThinkingRef.current ?? speaker.character.thinking,
          persona: personaRef.current,
          state: sceneStateRef.current,
          lore,
          memory: memory.block(history),
          direction: direction.current(),
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
        const updated = await addVariant(db, replacing, reply, thought, refine)
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
    [db, chatId, setMessages, memory, direction]
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

  // Every few lines, with the director on, where the scene stands and whose feelings changed
  // are noted aside, without holding the scene up: the next line just picks them up.
  const chronicle = useCallback(() => {
    const all = messagesRef.current
    if (!roomRef.current.director || chronicling.current || all.length - chronicledAt.current < CHRONICLE_EVERY) return
    chronicledAt.current = all.length
    const ctrl = new AbortController()
    chronicling.current = ctrl
    ;(async () => {
      try {
        const cfg = await loadSettings(db)
        const noted = await askChronicle(
          cfg,
          {
            room: roomRef.current,
            members: membersRef.current,
            history: all,
            userName: userNameOf(roomRef.current, personaRef.current),
            state: sceneStateRef.current,
          },
          ctrl.signal
        )
        if (!noted || ctrl.signal.aborted) return
        if (noted.state && noted.state !== sceneStateRef.current) {
          await setSceneState(db, chatId, noted.state)
          setSceneStateValue(noted.state)
        }
        if (noted.bonds.size) {
          for (const [id, bonds] of noted.bonds) await setMemberBonds(db, roomRef.current.id, id, bonds)
          const next = membersRef.current.map((m) => (noted.bonds.has(m.characterId) ? { ...m, bonds: noted.bonds.get(m.characterId)! } : m))
          membersRef.current = next
          castRef.current(next)
        }
      } catch {
        // The chronicle is an extra; a failed one waits for the next lines.
      } finally {
        if (chronicling.current === ctrl) chronicling.current = null
      }
    })()
  }, [db, chatId])

  useEffect(() => () => chronicling.current?.abort(), [])

  // After a turn, when the room asks for plot twists and the talk has run a while without
  // one, the narrator may bring in an event, and someone reacts to it.
  const plot = useCallback(
    async (ctrl: AbortController) => {
      const room = roomRef.current
      if (!room.director || room.plot <= 0 || ctrl.signal.aborted) return
      if (messagesRef.current.length - eventAt.current < EVENT_GAP || Math.random() >= room.plot * EVENT_CHANCE) return
      eventAt.current = messagesRef.current.length
      setPhase('plotting')
      let text: string | null = null
      try {
        const cfg = await loadSettings(db)
        text = await askEvent(
          cfg,
          {
            room,
            members: membersRef.current,
            history: messagesRef.current,
            userName: userNameOf(room, personaRef.current),
            state: sceneStateRef.current,
          },
          ctrl.signal
        )
      } catch {
        return
      }
      if (!text || ctrl.signal.aborted || discarded.current.has(ctrl)) return
      const event = await narrate(text, absentIds(membersRef.current))
      eventAt.current = messagesRef.current.length
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const entered = await stage(ctrl, event)
      const history = messagesRef.current
      const planned = (await resolve(ctrl, nextSpeaker(history, membersRef.current), event)).slice(0, 1)
      await runQueue(ctrl, [...planned, ...arrivals(entered, planned, 1)])
    },
    [db, narrate, stage, resolve, runQueue, arrivals]
  )

  // After a turn, what fell out of the window as the user sees the scene goes into the long
  // memory: only lines everyone in the scene could hear, so the summary gives no whisper away.
  const rememberScene = useCallback(async () => {
    if (!longMemoryEnabled()) return
    const all = messagesRef.current
    const room = roomRef.current
    const cfg = await loadSettings(db)
    const kept = selectHistory(all, (m) => turnTokens(toTurn(m)) + 12, cfg, {
      messages: cfg.roomMessages,
      system: [room.scenario, memory.block(all)].join('\n'),
      maxTokens: Math.max(0, ...membersRef.current.map((m) => tokenLimit(m.character))),
    }).length
    const user = userNameOf(room, personaRef.current)
    memory.remember(all, kept, (m) => {
      if (m.audience) return null
      const who = m.kind === 'narration' ? t('room.narrator') : m.role === 'user' ? user : nameOf(m.speakerId)
      return `${who}: ${m.content.replace(/\s+/g, ' ').trim()}`
    })
  }, [db, memory, nameOf])

  const settle = useCallback(
    (ctrl: AbortController) => {
      chronicle()
      rememberScene().catch(() => {})
      if (!task.finish(ctrl)) return
      setDraft(null)
      setPhase('idle')
      setQueue([])
      setReplacingId(null)
      setAuto(null)
    },
    [task, chronicle, rememberScene]
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
    const initialCount = roomRef.current.opening.trim() ? 1 : 0
    if (
      !titleRef.current &&
      (users === 1 || (users === 0 && all.length > initialCount)) &&
      all.some((m) => m.role === 'assistant' && m.speakerId !== null)
    ) {
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
        if (await runQueue(ctrl, [...planned, ...arrivals(entered, planned, 0)])) await plot(ctrl)
        maybeName()
      } finally {
        settle(ctrl)
      }
    },
    [db, chatId, task, begin, stage, resolve, arrivals, runQueue, plot, settle, setMessages, maybeName]
  )

  // With nothing typed, the scene goes on by itself for one line.
  const proceed = useCallback(async () => {
    if (task.current()) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const ctrl = begin()
    try {
      const history = messagesRef.current
      const planned = await resolve(ctrl, nextSpeaker(history, membersRef.current), history[history.length - 1])
      if (await runQueue(ctrl, planned.slice(0, 1))) await plot(ctrl)
      maybeName()
    } finally {
      settle(ctrl)
    }
  }, [task, begin, resolve, runQueue, plot, settle, maybeName])

  // This character takes the next turn, even one who only listens.
  const nudge = useCallback(
    async (characterId: number) => {
      if (task.current()) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const ctrl = begin()
      try {
        const history = messagesRef.current
        await runQueue(ctrl, [turnFor(history[history.length - 1], characterId)])
        maybeName()
      } finally {
        settle(ctrl)
      }
    },
    [task, begin, runQueue, settle, maybeName]
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
          // A stalled dialogue is where an event helps most.
          await plot(ctrl)
          setAuto({ done: done + 1, total })
        }
        maybeName()
      } finally {
        settle(ctrl)
      }
    },
    [task, begin, resolve, runQueue, plot, settle, maybeName]
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
    memory,
    direction,
    messages,
    loaded,
    sceneState,
    draft,
    phase,
    error,
    title,
    naming,
    replacingId,
    queue,
    auto,
    thinking,
    toggleThinking,
    persona,
    personaId,
    selectPersona,
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
    removeRefine,
    removeVariant,
    removeMessage,
    discard,
    rename,
    autoName,
  }
}
