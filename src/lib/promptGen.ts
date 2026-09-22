import { streamChat, type ChatTurn, type StreamPart } from '@/api/llm'
import type { ServerSettings } from '@/db/settings'
import type { Locale } from '@/i18n'

export type PromptLength = 'short' | 'medium' | 'long'
export type PromptFormat = 'prose' | 'sections'

export type PromptGenOptions = {
  length: PromptLength
  format: PromptFormat
}

export type PromptGenInput = {
  // In 'improve' mode this is the list of requested changes and may be empty.
  description: string
  name: string
  // The prompt already in the editor; set only in 'improve' mode.
  base: string | null
  options: PromptGenOptions
  locale: Locale
}

const LENGTH_RULES: Record<PromptLength, string> = {
  short: 'Keep it compact: about 120-200 words.',
  medium: 'Aim for about 300-450 words.',
  long: 'Be thorough: about 600-900 words, with concrete details and a few sample lines of dialogue.',
}

const FORMAT_RULES: Record<PromptFormat, string> = {
  prose: 'Write flowing prose paragraphs without headings or lists.',
  sections:
    'Structure it with short Markdown headings (for example: personality, background, speech style, behavior, relationship with the user) and concise text or bullet points under each.',
}

function languageRule(locale: Locale) {
  const fallback = locale === 'en' ? 'English' : 'Russian'
  return `Write in the same language as the user's text. If that is unclear, write in ${fallback}.`
}

function systemRules(input: PromptGenInput) {
  return [
    'You write system prompts for roleplay AI characters in a chat app.',
    'The prompt is addressed to the model in the second person ("You are ...") and defines the character: personality, background, speech style, habits, how they treat the user, and what they never do.',
    'Make the character specific and alive: concrete details beat generic adjectives. Do not add rules about being an AI, safety disclaimers or instructions about formatting replies.',
    input.name.trim()
      ? `The character's name is ${input.name.trim()}.`
      : 'If no name is given, invent one that fits the character.',
    LENGTH_RULES[input.options.length],
    FORMAT_RULES[input.options.format],
    languageRule(input.locale),
    'Reply with the prompt text only: no preface, no comments after it, no quotes or code fences around it.',
  ].join('\n')
}

function requestText(input: PromptGenInput) {
  if (input.base === null) return input.description.trim()
  const changes = input.description.trim() || 'No specific requests: fill gaps, remove contradictions and make the character more vivid while keeping its core.'
  return `Here is the current system prompt:\n\n${input.base.trim()}\n\nRewrite it. Requested changes: ${changes}`
}

// A revision only resends the latest draft, not the whole chain of drafts, so a long
// back-and-forth doesn't eat into the model's context.
export function buildPromptMessages(input: PromptGenInput, revision?: { draft: string; note: string }): ChatTurn[] {
  const messages: ChatTurn[] = [
    { role: 'system', content: systemRules(input) },
    { role: 'user', content: requestText(input) },
  ]
  if (revision) {
    messages.push(
      { role: 'assistant', content: revision.draft },
      { role: 'user', content: `Revise the prompt: ${revision.note.trim()}\nReply with the full revised prompt only.` }
    )
  }
  return messages
}

export function buildGreetingMessages(prompt: string, name: string, locale: Locale): ChatTurn[] {
  return [
    {
      role: 'system',
      content: [
        "You write the opening message a roleplay character sends when a new chat starts. You receive the character's system prompt.",
        'Write it fully in character: one to three short paragraphs that set the scene and give the user something to react to. Put actions and scene description in *asterisks*.',
        name.trim() ? `The character's name is ${name.trim()}.` : '',
        languageRule(locale),
        'Reply with the message text only.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    { role: 'user', content: prompt.trim() },
  ]
}

export function streamGeneration(cfg: ServerSettings, messages: ChatTurn[], signal: AbortSignal): AsyncGenerator<StreamPart> {
  return streamChat(
    cfg,
    // The token budget is generous because reasoning models spend part of it thinking
    // before the prompt itself starts.
    { messages, temperature: 0.9, maxTokens: 3000, topP: 0.95, thinking: 'auto' },
    signal
  )
}

// Models often wrap the answer despite being told not to: a code fence, quotes, or a
// "System prompt:" line in front.
export function cleanGenerated(text: string) {
  let out = text.trim()
  const fence = out.match(/^```[\w-]*\n([\s\S]*?)\n```$/)
  if (fence) out = fence[1].trim()
  out = out.replace(/^(system prompt|системный промпт|промпт|prompt)\s*:\s*\n?/i, '')
  if (/^["«“].*["»”]$/s.test(out) && !/["«“»”]/.test(out.slice(1, -1))) out = out.slice(1, -1)
  return out.trim()
}

export function countWords(text: string) {
  const words = text.trim().match(/\S+/g)
  return words ? words.length : 0
}
