import type { Message, MessageKind } from '@/db/messages'
import type { FloorMode, RoomMember } from '@/db/rooms'

import { hearing, USER } from './audience'

// One line a character is about to say.
export type Planned = {
  characterId: number
  kind: Exclude<MessageKind, 'narration'>
  // Who the line answers: USER, another character, or null for the whole room.
  addressees: number[] | null
  // Inherited from the line it answers, so a whisper is answered in a whisper.
  audience: number[] | null
  // 'turn' is a line nobody asked for: the user pressed continue, autoplay, or a nudge.
  cue?: 'turn'
}

// When the scores leave the choice open, the director is asked one of two questions.
export type Ambiguity =
  | { question: 'one'; candidates: number[] }
  | { question: 'who-else'; candidates: number[]; limit: number }

export type TurnPlan = { queue: Planned[]; ambiguous: Ambiguity | null }

const MENTION = 1
const TRIGGER = 0.6
const TALKATIVENESS = 0.5
const SILENCE_STEP = 0.08
const SILENCE_MAX = 0.4
const JUST_SPOKE = -0.5
const JITTER = 0.15
// Below this gap between the two best scores the pick is a coin toss.
const CLOSE_CALL = 0.25
const REACT_AT = 0.3
const CUT_IN_AT = 0.65
const MAYBE_CUT_IN_AT = 0.35

// Names are matched by their stem, so that "Лисе" and "Лису" both find "Лиса" and
// "Борису" finds "Борис": the first word with its trailing vowels and soft signs cut.
function stem(name: string) {
  const word = name.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const cut = word.replace(/[аеёиоуыэюяйьaeiouy]+$/u, '')
  return cut.length >= 3 ? cut : word
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function mentions(text: string, name: string) {
  const root = stem(name)
  return root.length > 0 && new RegExp(`(^|[^\\p{L}])${escape(root)}`, 'iu').test(text)
}

// A character is spoken to when the line calls them by name at its start or its end:
// "Лиса, ты что думаешь?", "Эй, Лиса!" or "Что скажешь, Борис?". Actions in asterisks
// don't count.
export function addressedIn(text: string, members: RoomMember[]) {
  const speech = text.replace(/\*[^*]*\*/g, ' ').trim()
  const head = speech.slice(0, 80)
  const tail = speech.slice(-80)
  return members
    .filter((m) => {
      const name = m.character.name
      if (!stem(name)) return false
      const opening = new RegExp(`^[^\\p{L}]*(\\p{L}+[,!]\\s*)?${escape(stem(name))}\\p{L}*\\s*[,!?]`, 'iu')
      const closing = new RegExp(`,\\s*${escape(stem(name))}\\p{L}*\\s*[.!?]*[^\\p{L}]*$`, 'iu')
      return opening.test(head) || closing.test(tail)
    })
    .map((m) => m.characterId)
}

// Word stems of going and coming, in Russian and English. A hit only buys a question to
// the director, so they are loose on purpose: "дверь" or "вон там" cost one short
// request, a missed exit costs the scene. \b is ASCII-only, hence the letter classes.
const LEAVING =
  /(уход|уйд|ушё?л|ушл|выход|выйд|вышл|вышел|покида|покину|убира|проваливай|катись|выгон|выгна|выстав|выталк|вытолк|выпровод|(^|[^\p{L}])вон([^\p{L}]|$)|двер|leav|left|get out|gets out|walks? out|storms? out|go away|goes away|kicks? .{0,20}out|throws? .{0,20}out|door)/iu
const COMING =
  /(вход|войд|вош(ё|е)л|вошл|заход|зайд|заш(ё|е)л|зашл|впуск|впуст|приш(ё|е)л|пришл|вернул|возвращ|появ|двер|come in|comes in|enter|let .{0,20} in|lets .{0,20} in|walks? in|return|arriv|door)/iu

// Whether a line might move someone in or out of the scene, worth asking the director:
// words of leaving while someone is here to leave, or of coming while someone is out.
export function movementCue(text: string, members: RoomMember[]) {
  return (
    (members.some((m) => m.present) && LEAVING.test(text)) || (members.some((m) => !m.present) && COMING.test(text))
  )
}

function triggered(text: string, triggers: string) {
  const lower = text.toLowerCase()
  return triggers
    .split(',')
    .map((topic) => topic.trim().toLowerCase())
    .filter((topic) => topic.length >= 3)
    .some((topic) => lower.includes(topic.length > 5 ? topic.slice(0, topic.length - 2) : topic))
}

export function scoreMembers(trigger: Message, members: RoomMember[], history: Message[]) {
  const scores = new Map<number, number>()
  const recent = history.slice(-12)
  for (const m of members) {
    let score = m.talkativeness * TALKATIVENESS + Math.random() * JITTER
    if (mentions(trigger.content, m.character.name)) score += MENTION
    if (m.triggers && triggered(trigger.content, m.triggers)) score += TRIGGER
    const lastSpoke = recent.map((h) => h.speakerId).lastIndexOf(m.characterId)
    const silence = lastSpoke === -1 ? recent.length : recent.length - 1 - lastSpoke
    score += Math.min(SILENCE_MAX, silence * SILENCE_STEP)
    if (lastSpoke !== -1 && silence < 2) score += JUST_SPOKE
    scores.set(m.characterId, score)
  }
  return scores
}

// Who can answer a line: in the scene, not muted, able to hear it and not its speaker.
function eligible(trigger: Message, members: RoomMember[]) {
  return members.filter(
    (m) => m.present && !m.muted && m.characterId !== trigger.speakerId && hearing(trigger, m.characterId)
  )
}

function replyTarget(trigger: Message) {
  if (trigger.kind === 'narration') return null
  return [trigger.role === 'user' ? USER : (trigger.speakerId ?? USER)]
}

type PlanInput = {
  mode: FloorMode
  trigger: Message
  // Picked by the user in the cast bar; empty means the line went to the room.
  addressees: number[]
  members: RoomMember[]
  history: Message[]
  maxChain: number
}

export function planTurn({ mode, trigger, addressees, members, history, maxChain }: PlanInput): TurnPlan {
  const here = new Set(members.filter((m) => m.present).map((m) => m.characterId))
  // Someone the user picked answers even when muted: picking them is asking them.
  let direct = addressees.filter((id) => here.has(id))
  if (!direct.length) {
    direct = addressedIn(trigger.content, eligible(trigger, members))
  }
  const reply = (characterId: number, kind: Planned['kind'] = 'say'): Planned => ({
    characterId,
    kind,
    addressees: replyTarget(trigger),
    audience: trigger.audience,
  })
  const queue = direct.map((id) => reply(id))
  const scores = scoreMembers(trigger, eligible(trigger, members), history)
  const ranked = [...scores.entries()]
    .filter(([id]) => !direct.includes(id))
    .sort((a, b) => b[1] - a[1])
  let ambiguous: Ambiguity | null = null

  if (!queue.length) {
    if (!ranked.length) return { queue, ambiguous }
    queue.push(reply(ranked[0][0]))
    if (ranked.length > 1 && ranked[0][1] - ranked[1][1] < CLOSE_CALL) {
      ambiguous = { question: 'one', candidates: ranked.slice(0, 4).map(([id]) => id) }
    }
  }

  const others = ranked.filter(([id]) => !queue.some((p) => p.characterId === id))
  const room = Math.max(0, maxChain - queue.length)
  if (mode === 'reactions') {
    for (const [id, score] of others) {
      if (queue.length >= direct.length + room || score < REACT_AT) break
      queue.push(reply(id, 'reaction'))
    }
  } else if (mode === 'open') {
    const sure = others.filter(([, score]) => score >= CUT_IN_AT).slice(0, room)
    for (const [id] of sure) queue.push(reply(id))
    const left = room - sure.length
    const maybe = others.filter(([, score]) => score >= MAYBE_CUT_IN_AT && score < CUT_IN_AT).map(([id]) => id)
    if (!ambiguous && left > 0 && maybe.length) {
      ambiguous = { question: 'who-else', candidates: maybe, limit: left }
    }
  }
  return { queue, ambiguous }
}

// Folds the director's answer into a plan. Anything it names outside the candidates is
// ignored, and an empty answer keeps what the heuristics chose.
export function applyDirector(plan: TurnPlan, picks: number[], trigger: Message): Planned[] {
  const ambiguous = plan.ambiguous
  if (!ambiguous) return plan.queue
  const allowed = picks.filter((id) => ambiguous.candidates.includes(id))
  if (ambiguous.question === 'one') {
    if (!allowed.length) return plan.queue
    const id = allowed[0]
    // Picking someone who missed the line (possible for a line nobody asked for) makes
    // theirs a remark to the room rather than an answer.
    const first = hearing(trigger, id)
      ? { ...plan.queue[0], characterId: id }
      : { ...plan.queue[0], characterId: id, addressees: null, audience: null }
    return [first, ...plan.queue.slice(1).filter((p) => p.characterId !== id)]
  }
  const extra = allowed
    .filter((id) => !plan.queue.some((p) => p.characterId === id))
    .slice(0, ambiguous.limit)
    .map((id): Planned => ({
      characterId: id,
      kind: 'say',
      addressees: replyTarget(trigger),
      audience: trigger.audience,
    }))
  return [...plan.queue, ...extra]
}

// In open floor, a character called by name in a line just said gets to answer it, as
// long as the chain has room. This is what lets the characters talk among themselves.
export function followUps(line: Message, members: RoomMember[], queued: Planned[], said: number, maxChain: number) {
  const room = maxChain - said - queued.length
  if (room <= 0) return []
  return addressedIn(line.content, eligible(line, members))
    .filter((id) => !queued.some((p) => p.characterId === id))
    .slice(0, room)
    .map((id): Planned => ({ characterId: id, kind: 'say', addressees: [line.speakerId ?? USER], audience: line.audience }))
}

// Who a finished line was said to: whoever it calls by name, otherwise whoever it answers.
export function detectAddressees(text: string, speakerId: number, members: RoomMember[], answering: number[] | null) {
  const called = addressedIn(text, members.filter((m) => m.characterId !== speakerId))
  return called.length ? called : answering
}

// A line nobody asked for, following `last`: an answer to it when the character heard
// it (in a whisper if it was one), otherwise a remark to the room.
export function turnFor(last: Message | undefined, characterId: number): Planned {
  const heard = last ? hearing(last, characterId) : null
  const answering = last && last.kind !== 'narration' && heard
  return {
    characterId,
    kind: 'say',
    addressees: answering ? [last.role === 'user' ? USER : (last.speakerId ?? USER)] : null,
    audience: last && heard ? last.audience : null,
    cue: 'turn',
  }
}

// The next speaker when nobody is waiting for an answer: whoever the last line called
// on, otherwise the best score apart from the last speaker. A character who could not
// hear the last line still may speak; then it is not an answer and goes to the room.
export function nextSpeaker(history: Message[], members: RoomMember[]): TurnPlan {
  const last = history[history.length - 1]
  const active = members.filter((m) => m.present && !m.muted)
  if (!last || !active.length) {
    return { queue: active.length ? [turnFor(last, active[0].characterId)] : [], ambiguous: null }
  }
  const called = (last.addressees ?? []).find(
    (id) => id !== USER && id !== last.speakerId && active.some((m) => m.characterId === id)
  )
  if (called) return { queue: [turnFor(last, called)], ambiguous: null }

  const candidates = active.filter((m) => m.characterId !== last.speakerId)
  if (!candidates.length) return { queue: [turnFor(last, active[0].characterId)], ambiguous: null }
  const ranked = [...scoreMembers(last, candidates, history).entries()].sort((a, b) => b[1] - a[1])
  const close = ranked.length > 1 && ranked[0][1] - ranked[1][1] < CLOSE_CALL
  return {
    queue: [turnFor(last, ranked[0][0])],
    ambiguous: close ? { question: 'one', candidates: ranked.slice(0, 4).map(([id]) => id) } : null,
  }
}
