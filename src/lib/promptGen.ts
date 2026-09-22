import { completeChat } from '@/api/llm'
import type { ServerSettings } from '@/db/settings'

const PROMPT = `Ты помогаешь писать системные промпты для ролевых ИИ-персонажей в чат-приложении.
По краткому описанию персонажа от пользователя напиши подробный системный промпт от второго лица ("Ты — ..."),
который задаёт личность, предысторию, манеру речи и особенности поведения персонажа.
Пиши на языке описания. Ответь только текстом промпта, без пояснений, заголовков и кавычек вокруг него.`

export async function generateSystemPrompt(cfg: ServerSettings, description: string) {
  const raw = await completeChat(cfg, {
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: description.trim() },
    ],
    temperature: 0.9,
    maxTokens: 1200,
    topP: 0.95,
    thinking: 'auto',
  })
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}
