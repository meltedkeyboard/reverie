import type { ChatRequest, ChatTurn, ContentPart } from '@/api/llm'
import type { Message } from '@/db/messages'
import type { Room, RoomMember } from '@/db/rooms'
import { ROOM_MESSAGES, selectHistory, turnTokens } from '@/lib/context'
import { toTurn, withReplyLimit } from '@/lib/replyStream'

import { hearing, USER } from './audience'
import type { Planned } from './floor'

export function userNameOf(room: Room) {
  return room.userName.trim() || 'User'
}

function list(names: string[]) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

type Window = Parameters<typeof selectHistory>[2]

type Context = {
  speaker: RoomMember
  room: Room
  members: RoomMember[]
  // Everything said before the line being written, as the user sees it.
  history: Message[]
  planned: Planned
  guidance?: string
  window: Window
}

// The scene as this one character lived it: their own lines as the assistant, everyone
// else's as the user with a name in front, and nothing they could not have heard.
export function buildRoomRequest({ speaker, room, members, history, planned, guidance, window }: Context): ChatRequest {
  const me = speaker.characterId
  const name = speaker.character.name
  const userName = userNameOf(room)
  const nameOf = (id: number | null) =>
    id === USER ? userName : (members.find((m) => m.characterId === id)?.character.name ?? 'Someone')
  // Only those in the scene now: someone who stepped out is not in the room to talk to.
  const others = members.filter((m) => m.characterId !== me && m.present).map((m) => m.character.name)
  const listener = (id: number) => (id === me ? 'you' : nameOf(id))

  const away = members.filter((m) => m.characterId !== me && !m.present).map((m) => m.character.name)
  const group = [
    'This is a group scene with several characters.',
    room.scenario.trim() ? `Scene: ${room.scenario.trim()}` : '',
    `Present: ${list([...others, userName])}.`,
    // The director follows exits and entrances only when it is on, so only then may the
    // characters make them; otherwise the user moves people with the cast sheet.
    room.director && away.length ? `Not in the scene right now: ${list(away)}.` : '',
    room.director
      ? `${name} may leave the scene, send someone out or let someone in when the story calls for it; show it as ${name}'s own action.`
      : '',
    `You are ${name}. Write only ${name}'s next line: what ${name} says and does. Never write lines, actions or thoughts for ${list([...others, userName])}. Do not start your reply with your name.`,
  ]
    .filter(Boolean)
    .join('\n')
  const limit = planned.kind === 'reaction' ? 1 : speaker.character.replyLimit
  const system = withReplyLimit([speaker.character.systemPrompt.trim(), group].filter(Boolean).join('\n\n'), limit)

  const turns: ChatTurn[] = []
  const push = (turn: ChatTurn) => {
    const prev = turns[turns.length - 1]
    if (prev?.role !== turn.role) return void turns.push(turn)
    // Many chat templates insist on alternating roles, so neighbors of one role merge.
    turns[turns.length - 1] = { role: turn.role, content: joinContent(prev.content, turn.content) }
  }

  // Whatever the speaker could not hear is dropped first, then the oldest lines go. Each
  // line is longer by the name written in front of it.
  const visible = selectHistory(
    history.filter((m) => hearing(m, me)),
    (m) => turnTokens(toTurn(m)) + 12,
    window,
    { messages: ROOM_MESSAGES, system, maxTokens: speaker.character.maxTokens }
  )
  for (const m of visible) {
    if (m.kind === 'narration') {
      push({ role: 'user', content: `[Narration] ${m.content}` })
      continue
    }
    if (m.role === 'assistant' && m.speakerId === me) {
      push({ role: 'assistant', content: m.content })
      continue
    }
    const who = m.role === 'user' ? userName : nameOf(m.speakerId)
    const targets = (m.addressees ?? []).filter((id) => id !== m.speakerId)
    let label: string
    if (hearing(m, me) === 'overheard') {
      label = `(You secretly overhear ${who} whispering to ${list(targets.map(nameOf))})`
    } else if (m.audience) {
      label = targets.length ? `${who} (whispering to ${list(targets.map(listener))})` : `${who} (whispering)`
    } else if (targets.length) {
      label = `${who} (to ${list(targets.map(listener))})`
    } else {
      label = who
    }
    const turn = toTurn(m)
    const prefix = `${label}: `
    const content: ChatTurn['content'] =
      typeof turn.content === 'string'
        ? prefix + turn.content
        : [...turn.content.filter((p) => p.type === 'image_url'), { type: 'text', text: prefix + m.content }]
    push({ role: 'user', content })
  }

  const to = (planned.addressees ?? []).filter((id) => id !== me)
  const toWhom = to.length ? ` to ${list(to.map(nameOf))}` : ''
  const whisper = planned.audience ? ' Keep it a whisper: only those in on the secret can hear it.' : ''
  const direction =
    planned.kind === 'reaction'
      ? `(OOC: ${name} reacts briefly to what just happened, in one or two sentences. Stay in character.)`
      : planned.cue === 'turn'
        ? `(OOC: It is ${name}'s turn. Continue the scene as ${name}${toWhom}.${whisper})`
        : `(OOC: ${name} now answers${toWhom}.${whisper})`
  const note = guidance?.trim() ? `${direction}\n(OOC: ${guidance.trim()})` : direction
  push({ role: 'user', content: note })

  const character = speaker.character
  return {
    messages: [{ role: 'system', content: system }, ...turns],
    temperature: character.temperature,
    // A reaction is kept short by the one-paragraph limit, not by the token budget: a
    // reasoning model spends most of the budget thinking before it writes a word.
    maxTokens: character.maxTokens,
    topP: character.topP,
    thinking: character.thinking,
  }
}

function joinContent(a: ChatTurn['content'], b: ChatTurn['content']): ChatTurn['content'] {
  if (typeof a === 'string' && typeof b === 'string') return `${a}\n\n${b}`
  const parts = (c: ChatTurn['content']): ContentPart[] => (typeof c === 'string' ? [{ type: 'text', text: c }] : c)
  return [...parts(a), ...parts(b)]
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Models in a group scene like to sign their line with their name and then carry on as
// somebody else. The name in front is dropped, and the text is cut where another
// speaker's line would begin.
export function cleanLine(text: string, speaker: string, others: string[]) {
  let line = text.replace(new RegExp(`^\\s*\\**${escape(speaker.trim())}\\**\\s*:\\s*`, 'i'), '')
  const names = others.map((n) => n.trim()).filter(Boolean)
  if (names.length) {
    const intrusion = new RegExp(`\\n\\s*\\**(${names.map(escape).join('|')})\\**\\s*(\\([^)]*\\))?\\s*:`, 'i')
    const at = line.search(intrusion)
    if (at >= 0) line = line.slice(0, at)
  }
  return line
}
