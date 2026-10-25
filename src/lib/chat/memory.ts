import { completeChat } from '@/api/llm'
import type { ServerSettings } from '@/db/prefs/settings'
import { cleanGenerated } from '@/lib/chat/promptGen'

// Long memory: what falls out of the context window is summed up, and the summary goes into
// the system prompt, so the characters remember the start of a long story.

// The summary is kept to about this many words, older parts squeezed as it grows.
const RECAP_WORDS = 400
// Lines summed up in one request, so a long chat turned on late is caught up in steps.
export const RECAP_CHUNK = 40
// So few lines fell out that a request for them is not worth it yet.
export const RECAP_BATCH = 4

const TIMEOUT_MS = 120_000

export function recapBlock(recap: string) {
  return `Earlier in this story (a summary of what is no longer shown in the conversation; it is what the characters remember):\n${recap.trim()}`
}

const SYSTEM = [
  'You keep the memory of a long roleplay chat: a running summary of what happened, for the characters to remember once the old lines are gone.',
  'Plain facts, past tense, third person, by name: events, decisions, promises, what was learned, how the relationships changed, important names, places and things. No commentary, no judgment, no quoting whole lines.',
].join('\n')

// The summary so far with the lines added; null when the model gave nothing back.
export async function summarize(cfg: ServerSettings, previous: string, lines: string[], signal: AbortSignal) {
  const prompt = [
    `The summary so far:\n${previous.trim() || '(nothing yet)'}`,
    `\nThe lines to add:\n${lines.join('\n')}`,
    `\nWrite the whole updated summary: keep everything from the summary so far that still matters, add what the new lines bring, in the order it happened. If it grows past about ${RECAP_WORDS} words, shorten the oldest parts first. Write in the language of the lines. Reply with the summary only.`,
  ].join('\n')
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
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 1200,
        topP: 0.95,
        thinking: 'off',
      },
      ctrl.signal
    )
    return cleanGenerated(raw) || null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}
