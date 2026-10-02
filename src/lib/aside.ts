import type { ChatRequest, ChatTurn, ContentPart } from '@/api/llm'
import { DEFAULT_SAMPLING, type Character, type ThinkingMode } from '@/db/characters'
import type { Message, MessageImage, Thought } from '@/db/messages'
import { attachmentUri } from '@/lib/attachments'
import type { Room, RoomMember } from '@/db/rooms'
import { USER } from '@/lib/room/audience'
import { userNameOf } from '@/lib/room/prompt'

// A question put to the model aside, with the pictures sent along.
export type AsideQuestion = { text: string; images: MessageImage[] }

export type AsideTurn = { question: AsideQuestion; answer: string; thought: Thought | null }

// What the model is told about the scene, how a line of the transcript is signed, and
// whether the model thinks first, as the character's own setting says.
export type AsideScene = {
  brief: string
  label: (m: Message) => string
  thinking: ThinkingMode
}

// Only text goes out, so a long stretch of the scene stays cheap.
const TRANSCRIPT_LINES = 30
// A room brief carries every member's sheet; a very long one is cut to keep the room.
const SHEET_MAX = 1500
// Answers explain and analyze, which takes more room than a line of roleplay.
const MAX_TOKENS = 1200

const SYSTEM = [
  'You are an AI assistant stepping outside a roleplay. The user has paused the story to ask you something privately; the characters cannot hear this conversation.',
  'You get a brief of the scene and a transcript of its latest lines. Answer as yourself, not as any character: explain, analyze, suggest, answer directly.',
  'Do not continue the story or write lines for the characters unless the user asks for that. Be concise. Reply in the language of the user.',
].join('\n')

function sheet(text: string) {
  const trimmed = text.trim()
  return trimmed.length > SHEET_MAX ? `${trimmed.slice(0, SHEET_MAX)}...` : trimmed
}

export function characterScene(character: Character): AsideScene {
  const prompt = sheet(character.systemPrompt)
  return {
    brief: [`The user is chatting one-on-one with ${character.name}.`, prompt ? `${character.name}'s character sheet:\n${prompt}` : '']
      .filter(Boolean)
      .join('\n\n'),
    label: (m) => (m.role === 'user' ? 'User' : character.name),
    thinking: character.thinking,
  }
}

export function roomScene(room: Room, members: RoomMember[]): AsideScene {
  const userName = userNameOf(room)
  const nameOf = (id: number | null) =>
    id === USER ? userName : (members.find((m) => m.characterId === id)?.character.name ?? 'Someone')
  // Thinking is set per character; the room follows it only when the whole cast agrees.
  const modes = new Set(members.map((m) => m.character.thinking))
  const sheets = members
    .map((m) => (m.character.systemPrompt.trim() ? `${m.character.name}:\n${sheet(m.character.systemPrompt)}` : ''))
    .filter(Boolean)
  return {
    brief: [
      `A group scene. The user plays ${userName}.`,
      room.scenario.trim() ? `Scene: ${room.scenario.trim()}` : '',
      `Cast: ${members.map((m) => m.character.name + (m.present ? '' : ' (out of the scene)')).join(', ')}.`,
      sheets.length ? `Character sheets:\n\n${sheets.join('\n\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    // The user sees whispers too, so the model gets them with who they were meant for.
    label: (m) => {
      if (m.kind === 'narration') return 'Narration'
      const who = m.role === 'user' ? userName : nameOf(m.speakerId)
      const targets = (m.addressees ?? []).filter((id) => id !== m.speakerId).map(nameOf)
      if (m.audience) return targets.length ? `${who} (whispering to ${targets.join(', ')})` : `${who} (whispering)`
      return targets.length ? `${who} (to ${targets.join(', ')})` : who
    },
    thinking: modes.size === 1 ? [...modes][0] : 'auto',
  }
}

// The scene goes in as a transcript inside one user turn rather than as assistant and user
// turns: given the character's lines as its own, a model tends to carry on in character.
export function buildAsideRequest(scene: AsideScene, history: Message[], thread: AsideTurn[], question: AsideQuestion): ChatRequest {
  const transcript = history
    .slice(-TRANSCRIPT_LINES)
    .map((m) => `${scene.label(m)}: ${m.content.trim()}${m.images.length ? ' [photo]' : ''}`.trim())
    .join('\n\n')
  const opening = [
    `Scene brief:\n${scene.brief}`,
    `Transcript of the latest lines:\n${transcript || '(nothing has been said yet)'}`,
  ].join('\n\n---\n\n')
  const questions = [...thread.map((turn) => turn.question), question]
  const turns: ChatTurn[] = []
  questions.forEach((q, i) => {
    const text = i === 0 ? `${opening}\n\n---\n\nMy question: ${q.text}` : q.text
    const pictures: ContentPart[] = q.images.map((image) => ({ type: 'image_url', image_url: { url: attachmentUri(image.file) } }))
    turns.push({ role: 'user', content: pictures.length ? [...pictures, { type: 'text', text }] : text })
    const answer = thread[i]?.answer
    if (answer) turns.push({ role: 'assistant', content: answer })
  })
  return {
    messages: [{ role: 'system', content: SYSTEM }, ...turns],
    temperature: DEFAULT_SAMPLING.temperature,
    maxTokens: MAX_TOKENS,
    topP: DEFAULT_SAMPLING.topP,
    thinking: scene.thinking,
  }
}
