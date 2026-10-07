import { streamChat, type ChatTurn, type StreamPart } from '@/api/llm'
import type { ServerSettings } from '@/db/prefs/settings'
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

type TextKind = 'prompt' | 'greeting'

const KIND_NAME: Record<TextKind, string> = {
  prompt: 'system prompt of a roleplay character',
  greeting: 'opening message of a roleplay character',
}

// A change to a text that is already there is an edit, not a new text: asked from scratch
// with the rules of length and format, the model wrote it over in its own way and lost the
// details, the sample lines and the layout. So the edit is a request of its own, with
// nothing but the text and the change.
function buildEditMessages(kind: TextKind, text: string, change: string): ChatTurn[] {
  return [
    {
      role: 'system',
      content: [
        `You edit the ${KIND_NAME[kind]}. You do not rewrite it.`,
        'Change only what the request asks for. Everything else stays word for word: every sentence, detail, example, sample line of dialogue, list, heading, *action* and line break, in the same order and the same formatting.',
        'Do not reword, summarize, reorder or restyle the parts the request does not touch, and add no new sections or headings unless asked.',
        'To shorten, cut the least important sentences and keep the rest as written; to add, put new sentences where they belong and keep the rest as written.',
        'Keep the language of the text.',
        `Reply with the whole edited ${kind === 'prompt' ? 'prompt' : 'message'} only: no preface, no comments, no quotes or code fences around it.`,
      ].join('\n'),
    },
    { role: 'user', content: `The text:\n\n${text.trim()}\n\nThe change: ${change.trim()}` },
  ]
}

// Improving the prompt there is, with no requests, adds and fixes rather than starts over.
const IMPROVE_DEFAULT =
  'fill the gaps and remove contradictions, making the character more vivid by adding concrete details; keep what is written'

// From scratch, a description becomes a prompt by the rules of length and format. Improving
// the current prompt and revising a version are edits of the text given. A revision only
// resends the latest draft, not the whole chain of drafts, so a long back-and-forth doesn't
// eat into the model's context.
export function buildPromptMessages(input: PromptGenInput, revision?: { draft: string; note: string }): ChatTurn[] {
  if (revision) return buildEditMessages('prompt', revision.draft, revision.note)
  if (input.base !== null) return buildEditMessages('prompt', input.base, input.description.trim() || IMPROVE_DEFAULT)
  return [
    { role: 'system', content: systemRules(input) },
    { role: 'user', content: input.description.trim() },
  ]
}

// `wishes` is what the user asked the greeting to be; empty leaves it to the model. A
// revision resends only the latest draft, as for the prompt.
export function buildGreetingMessages(
  prompt: string,
  name: string,
  locale: Locale,
  wishes = '',
  revision?: { draft: string; note: string }
): ChatTurn[] {
  if (revision) return buildEditMessages('greeting', revision.draft, revision.note)
  return [
    {
      role: 'system',
      content: [
        "You write the opening message a roleplay character sends when a new chat starts. You receive the character's system prompt.",
        'Write it fully in character: one to three short paragraphs that set the scene and give the user something to react to. Put actions and scene description in *asterisks*.',
        name.trim() ? `The character's name is ${name.trim()}.` : '',
        wishes.trim() ? `The user wants the greeting to be: ${wishes.trim()}` : '',
        languageRule(locale),
        'Reply with the message text only.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    { role: 'user', content: prompt.trim() },
  ]
}

// `thinking` is the switch of the generator sheet, for this request only. An edit runs
// cooler, so the model copies what it should keep instead of inventing it anew.
export function streamGeneration(
  cfg: ServerSettings,
  messages: ChatTurn[],
  signal: AbortSignal,
  options: { thinking: boolean; edit: boolean }
): AsyncGenerator<StreamPart> {
  return streamChat(
    cfg,
    // The token budget is generous because reasoning models spend part of it thinking
    // before the prompt itself starts.
    {
      messages,
      temperature: options.edit ? 0.4 : 0.9,
      maxTokens: 3000,
      topP: 0.95,
      thinking: options.thinking ? 'on' : 'off',
    },
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
