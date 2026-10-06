import { completeChat, isServerError } from '@/api/llm'
import type { ThinkingMode } from '@/db/characters'
import type { Message } from '@/db/messages'
import type { ServerSettings } from '@/db/prefs/settings'

const PROMPT =
  'Придумай короткое название для ролевой переписки ниже: от двух до пяти слов, на языке переписки. ' +
  'Ответь только названием, без кавычек, пояснений и точки в конце.'

// Models like to wrap the title in straight or guillemet quotes, or in markdown bold.
const QUOTES_AROUND = new RegExp('^["\'\\u00ab*]+|["\'\\u00bb*.]+$', 'g')

// nameOf tells who said an assistant message: the character, or in a room whoever spoke.
export async function suggestTitle(cfg: ServerSettings, nameOf: (m: Message) => string, messages: Message[]) {
  const transcript = messages
    .slice(-8)
    .map((m) => {
      const text = m.content.trim().slice(0, 600) || (m.images.length ? '[фото]' : '')
      return `${m.role === 'user' ? 'Пользователь' : nameOf(m)}: ${text}`
    })
    .join('\n\n')

  const ask = (thinking: ThinkingMode, maxTokens: number) =>
    completeChat(cfg, {
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: transcript },
      ],
      temperature: 0.5,
      maxTokens,
      topP: 0.95,
      thinking,
    })

  // A title needs no thinking, whatever the character's own setting is, so it is asked
  // for with thinking off. Some servers or models can't turn it off (or reject the field),
  // and then the model spends the short budget thinking and returns nothing; that gets a
  // second try with the server's default and room to think. A server that can't be
  // reached isn't asked twice.
  const quick = await ask('off', 400).catch((err) => {
    if (isServerError(err)) return ''
    throw err
  })
  return cleanTitle(quick) ?? cleanTitle(await ask('auto', 2048))
}

function cleanTitle(raw: string) {
  // The answer is what follows the thinking. Some templates open <think> themselves, so
  // only the closing tag shows up; a reply cut off mid-thought has only the opening one.
  const parts = raw.split(/<\/think>/i)
  const answer = parts.length > 1 ? parts[parts.length - 1] : raw.replace(/<think>[\s\S]*$/i, '')
  const line =
    answer
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? ''
  const title = line
    .replace(/^(название|title)\s*:\s*/i, '')
    .replace(QUOTES_AROUND, '')
    .trim()
  return title.slice(0, 80) || null
}
