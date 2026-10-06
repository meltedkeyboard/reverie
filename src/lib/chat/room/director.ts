import { completeChat } from '@/api/llm'
import type { Message } from '@/db/messages'
import type { RoomMember } from '@/db/rooms'
import type { ServerSettings } from '@/db/prefs/settings'

import type { Ambiguity } from './floor'

const TIMEOUT_MS = 15_000
const DESCRIPTION_CHARS = 160

const SYSTEM =
  'You direct a group roleplay scene. You decide which characters speak next, judging by who they are and what was just said. Answer with JSON only, no explanations.'

type Request = {
  ambiguity: Ambiguity
  members: RoomMember[]
  history: Message[]
  userName: string
  // Already answering, for the who-else question.
  answering: number[]
}

// One short extra request, made only when the heuristics can't tell. Returns the chosen
// character ids, or null when the director failed, timed out or answered nonsense; the
// caller then keeps the heuristic choice.
export async function askDirector(cfg: ServerSettings, req: Request, signal: AbortSignal): Promise<number[] | null> {
  const nameOf = (id: number | null) => req.members.find((m) => m.characterId === id)?.character.name ?? 'Someone'
  const cast = req.members
    .map((m) => {
      const about = m.character.systemPrompt.replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_CHARS)
      const topics = m.triggers.trim() ? ` Cares about: ${m.triggers.trim()}.` : ''
      return `- ${m.character.name}: ${about}${topics}`
    })
    .join('\n')
  const recent = req.history
    .slice(-6)
    .map((m) => {
      const who = m.kind === 'narration' ? 'Narration' : m.role === 'user' ? req.userName : nameOf(m.speakerId)
      return `${who}: ${m.content.replace(/\s+/g, ' ').trim().slice(0, 400)}`
    })
    .join('\n')
  const choices = req.ambiguity.candidates.map(nameOf).join(', ')
  const question =
    req.ambiguity.question === 'one'
      ? `Which one character should answer the last line? Choose exactly one from: ${choices}.`
      : `${req.answering.map(nameOf).join(', ')} will answer the last line. Which other characters would naturally cut in because the line concerns them? Choose up to ${req.ambiguity.limit} from: ${choices}. An empty list is fine if nobody would.`

  const ctrl = new AbortController()
  const abort = () => ctrl.abort()
  signal.addEventListener('abort', abort)
  const timer = setTimeout(abort, TIMEOUT_MS)
  try {
    const raw = await completeChat(
      cfg,
      {
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `Characters:\n${cast}\n\nRecent lines:\n${recent}\n\n${question}\nAnswer as {"speakers": ["Name"]}.`,
          },
        ],
        temperature: 0.3,
        maxTokens: 150,
        topP: 0.95,
        thinking: 'off',
      },
      ctrl.signal
    )
    return parsePicks(raw, req.members)
  } catch {
    if (signal.aborted) throw new Error('Aborted')
    return null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export type Movement = { leave: number[]; enter: number[] }

const STAGE_SYSTEM =
  'You keep track of who is in the scene of a group roleplay. You judge only what happens, not what is said about it. Answer with JSON only, no explanations.'

// Whether a line moves anyone out of the scene or into it. Asked only when the line
// looks like it might (see movementCue), and checked against who can actually move:
// someone in the scene can only leave, someone out of it can only come in.
export async function askMovement(
  cfg: ServerSettings,
  req: { line: Message; members: RoomMember[]; history: Message[]; userName: string },
  signal: AbortSignal
): Promise<Movement | null> {
  const nameOf = (id: number | null) => req.members.find((m) => m.characterId === id)?.character.name ?? 'Someone'
  const whoSaid = (m: Message) => (m.kind === 'narration' ? 'Narration' : m.role === 'user' ? req.userName : nameOf(m.speakerId))
  const here = req.members.filter((m) => m.present).map((m) => m.character.name)
  const away = req.members.filter((m) => !m.present).map((m) => m.character.name)
  const recent = req.history
    .slice(-5, -1)
    .map((m) => `${whoSaid(m)}: ${m.content.replace(/\s+/g, ' ').trim().slice(0, 300)}`)
    .join('\n')
  const prompt = [
    `In the scene: ${here.join(', ') || 'nobody'}. ${req.userName} is the player and never moves.`,
    `Out of the scene: ${away.join(', ') || 'nobody'}.`,
    recent ? `\nRecent lines:\n${recent}` : '',
    `\nLast line, ${whoSaid(req.line)}: ${req.line.content.replace(/\s+/g, ' ').trim().slice(0, 800)}`,
    '\nDoes the last line make anyone leave the scene or come into it right now? Count only what happens in the line itself: someone walks out, is thrown out, walks in, or is let in. Threats, orders, requests, plans and talk about the past change nothing: someone told to leave is still here until a line shows them going. Opening the door to someone and letting or calling them in counts as them coming in. Going to another room, out of earshot, counts as leaving.',
    'Answer as {"leave": ["Name"], "enter": ["Name"]}, with empty lists if nobody moves.',
  ]
    .filter(Boolean)
    .join('\n')

  const ctrl = new AbortController()
  const abort = () => ctrl.abort()
  signal.addEventListener('abort', abort)
  const timer = setTimeout(abort, TIMEOUT_MS)
  try {
    const raw = await completeChat(
      cfg,
      {
        messages: [
          { role: 'system', content: STAGE_SYSTEM },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 120,
        topP: 0.95,
        thinking: 'off',
      },
      ctrl.signal
    )
    const answer = parseJson(raw)
    if (!answer) return null
    return {
      leave: matchNames(answer.leave, req.members.filter((m) => m.present)),
      enter: matchNames(answer.enter, req.members.filter((m) => !m.present)),
    }
  } catch {
    if (signal.aborted) throw new Error('Aborted')
    return null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

function parseJson(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '')
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function parsePicks(raw: string, members: RoomMember[]) {
  const names = parseJson(raw)?.speakers
  return Array.isArray(names) ? matchNames(names, members) : null
}

// The model's names back to ids, forgiving case and a missing surname.
function matchNames(names: unknown, members: RoomMember[]) {
  if (!Array.isArray(names)) return []
  const ids: number[] = []
  for (const name of names) {
    if (typeof name !== 'string') continue
    const wanted = name.trim().toLowerCase()
    const found =
      members.find((m) => m.character.name.trim().toLowerCase() === wanted) ??
      members.find((m) => m.character.name.trim().toLowerCase().split(/\s+/)[0] === wanted.split(/\s+/)[0])
    if (found && !ids.includes(found.characterId)) ids.push(found.characterId)
  }
  return ids
}
