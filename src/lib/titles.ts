import { completeChat } from '@/api/llm'
import type { Message } from '@/db/messages'
import type { ServerSettings } from '@/db/settings'

const PROMPT =
  'Придумай короткое название для ролевой переписки ниже: от двух до пяти слов, на языке переписки. ' +
  'Ответь только названием, без кавычек, пояснений и точки в конце.'

// Models like to wrap the title in straight or guillemet quotes, or in markdown bold.
const QUOTES_AROUND = new RegExp('^["\'\\u00ab*]+|["\'\\u00bb*.]+$', 'g')

export async function suggestTitle(cfg: ServerSettings, characterName: string, messages: Message[]) {
  const transcript = messages
    .slice(-8)
    .map((m) => {
      const text = m.content.trim().slice(0, 600) || (m.images.length ? '[фото]' : '')
      return `${m.role === 'user' ? 'Пользователь' : characterName}: ${text}`
    })
    .join('\n\n')

  const raw = await completeChat(cfg, {
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: transcript },
    ],
    temperature: 0.5,
    // Reasoning models think before they answer, so the budget is far above what a
    // five-word title needs; the rest is cut off by cleanTitle.
    maxTokens: 400,
    topP: 0.95,
    thinking: 'auto',
  })
  return cleanTitle(raw)
}

function cleanTitle(raw: string) {
  const line =
    raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? ''
  const title = line
    .replace(/^(название|title)\s*:\s*/i, '')
    .replace(QUOTES_AROUND, '')
    .trim()
  return title.slice(0, 80) || null
}
