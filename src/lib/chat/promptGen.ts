import { streamChat, type ChatTurn, type ContentPart, type StreamPart } from '@/api/llm'
import type { ServerSettings } from '@/db/prefs/settings'
import type { MessageImage } from '@/db/messages'
import type { Locale } from '@/i18n'
import { attachmentUri, withInlinedImages } from '@/lib/images/attachments'

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
  images?: MessageImage[]
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
  const hasImages = (input.images?.length ?? 0) > 0
  return [
    'You write system prompts for roleplay AI characters in a chat app.',
    'The prompt is addressed to the model in the second person ("You are ...") and defines the character: personality, background, speech style, habits, how they treat the user, and what they never do.',
    'Make the character specific and alive: concrete details beat generic adjectives. Do not add rules about being an AI, safety disclaimers or instructions about formatting replies.',
    input.name.trim()
      ? `The character's name is ${input.name.trim()}.`
      : 'If no name is given, invent one that fits the character.',
    hasImages
      ? [
          'Reference images are attached to guide the character creation.',
          'Carefully analyze the visual details in the images: physical appearance (hair, eyes, face, build, distinctive features), clothing, aesthetic, expressions, posture, setting, mood, and any situational context.',
          'Incorporate these visual elements into the character definition (appearance, persona, demeanor, and background).',
          'If the image contains multiple characters, follow the user instructions on which character is the subject of this prompt and who the other character(s) are, describing their relationship, dynamic, and interactions accordingly.',
        ].join(' ')
      : '',
    LENGTH_RULES[input.options.length],
    FORMAT_RULES[input.options.format],
    languageRule(input.locale),
    'Reply with the prompt text only: no preface, no comments after it, no quotes or code fences around it.',
  ]
    .filter(Boolean)
    .join('\n')
}

type TextKind = 'prompt' | 'greeting' | 'persona'

const KIND_NAME: Record<TextKind, string> = {
  prompt: 'system prompt of a roleplay character',
  greeting: 'opening message of a roleplay character',
  persona: 'user persona description for roleplay',
}

// A change to a text that is already there is an edit, not a new text: asked from scratch
// with the rules of length and format, the model wrote it over in its own way and lost the
// details, the sample lines and the layout. So the edit is a request of its own, with
// nothing but the text and the change.
function buildEditMessages(kind: TextKind, text: string, change: string, images?: MessageImage[]): ChatTurn[] {
  const userText = `The text:\n\n${text.trim()}\n\nThe change: ${change.trim()}`
  let content: string | ContentPart[] = userText
  if (images && images.length > 0) {
    const pictures: ContentPart[] = images.map((image) => ({
      type: 'image_url' as const,
      image_url: { url: attachmentUri(image.file) },
    }))
    content = [...pictures, { type: 'text' as const, text: userText }]
  }
  const kindTarget = kind === 'prompt' ? 'prompt' : kind === 'greeting' ? 'message' : 'description'
  return [
    {
      role: 'system',
      content: [
        `You edit the ${KIND_NAME[kind]}. You do not rewrite it.`,
        'Change only what the request asks for. Everything else stays word for word: every sentence, detail, example, sample line of dialogue, list, heading, *action* and line break, in the same order and the same formatting.',
        'Do not reword, summarize, reorder or restyle the parts the request does not touch, and add no new sections or headings unless asked.',
        'To shorten, cut the least important sentences and keep the rest as written; to add, put new sentences where they belong and keep the rest as written.',
        images && images.length > 0
          ? 'Visual references (images) are attached. Incorporate visual details and situation context from the images into the requested changes. If multiple characters are present, follow instructions on which character is being edited.'
          : '',
        'Keep the language of the text.',
        `Reply with the whole edited ${kindTarget} only: no preface, no comments, no quotes or code fences around it.`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    { role: 'user', content },
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
  if (revision) return buildEditMessages('prompt', revision.draft, revision.note, input.images)
  if (input.base !== null)
    return buildEditMessages('prompt', input.base, input.description.trim() || IMPROVE_DEFAULT, input.images)

  const text = input.description.trim()
  const fallback = input.images?.length
    ? 'Create a character system prompt based on the attached image(s).'
    : ''
  const userText = text || fallback

  let content: string | ContentPart[] = userText
  if (input.images && input.images.length > 0) {
    const pictures: ContentPart[] = input.images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: attachmentUri(img.file) },
    }))
    content = [...pictures, { type: 'text' as const, text: userText }]
  }

  return [
    { role: 'system', content: systemRules(input) },
    { role: 'user', content },
  ]
}

// `wishes` is what the user asked the greeting to be; empty leaves it to the model. A
// revision resends only the latest draft, as for the prompt.
export function buildGreetingMessages(
  prompt: string,
  name: string,
  locale: Locale,
  wishes = '',
  revision?: { draft: string; note: string },
  images?: MessageImage[]
): ChatTurn[] {
  if (revision) return buildEditMessages('greeting', revision.draft, revision.note, images)

  const hasImages = (images?.length ?? 0) > 0
  const systemContent = [
    "You write the opening message a roleplay character sends when a new chat starts. You receive the character's system prompt.",
    'Write it fully in character: one to three short paragraphs that set the scene and give the user something to react to. Put actions and scene description in *asterisks*.',
    name.trim() ? `The character's name is ${name.trim()}.` : '',
    hasImages
      ? [
          'Visual references (images) are attached portraying the scene or situation.',
          'Start directly in the situation depicted in the image: incorporate the character posture, action, facial expression, emotional tone, attire, and immediate surroundings.',
          'If multiple characters are shown in the image, follow the user instructions on which character is speaking/acting and who the other character(s) are, reflecting their relationship, presence, and interaction in the scene.',
        ].join(' ')
      : '',
    wishes.trim() ? `The user wants the greeting to be: ${wishes.trim()}` : '',
    languageRule(locale),
    'Reply with the message text only.',
  ]
    .filter(Boolean)
    .join('\n')

  let userContent: string | ContentPart[] = prompt.trim()
  if (hasImages && images) {
    const pictures: ContentPart[] = images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: attachmentUri(img.file) },
    }))
    const promptText = prompt.trim()
      ? `Character system prompt:\n\n${prompt.trim()}`
      : 'Start a roleplay greeting matching the character and the attached scene.'
    const wishesText = wishes.trim() ? `\n\nUser wishes and clarifications:\n${wishes.trim()}` : ''
    userContent = [...pictures, { type: 'text' as const, text: `${promptText}${wishesText}` }]
  }

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ]
}

export type PersonaLength = 'short' | 'medium' | 'long'
export type PersonaFormat = 'prose' | 'sections'

export type PersonaGenOptions = {
  length: PersonaLength
  format: PersonaFormat
}

export type PersonaGenInput = {
  description: string
  name: string
  base: string | null
  options: PersonaGenOptions
  locale: Locale
  images?: MessageImage[]
}

const PERSONA_LENGTH_RULES: Record<PersonaLength, string> = {
  short: 'Keep it compact: about 60-120 words focusing on key visual traits, role, and core personality.',
  medium: 'Aim for about 150-250 words: appearance, personality, demeanor, background, and quirks.',
  long: 'Be thorough: about 300-500 words with rich details: physical appearance, clothing, personality nuances, background, habits, and how others perceive them.',
}

const PERSONA_FORMAT_RULES: Record<PersonaFormat, string> = {
  prose: 'Write concise, flowing prose paragraphs without headings or bullet lists.',
  sections:
    'Structure it with short Markdown headings (for example: Appearance, Personality, Background, Quirks) and concise text or bullet points under each.',
}

function personaSystemRules(input: PersonaGenInput) {
  const hasImages = (input.images?.length ?? 0) > 0
  return [
    'You write user persona descriptions for roleplay chats in an AI chat app.',
    "The persona defines the user's character: appearance, personality, background, role/occupation, speech or demeanor, quirks, and how AI characters should perceive or treat them.",
    'Make the persona vivid, coherent and specific: concrete details, aesthetic notes, and clear traits beat generic descriptions. Do not add rules about being an AI, safety disclaimers, or instructions for the AI model.',
    input.name.trim()
      ? `The user's character name is ${input.name.trim()}.`
      : 'If no name is specified, focus on the persona description.',
    hasImages
      ? [
          'Reference images are attached portraying the user persona / character.',
          'Carefully analyze the visual details in the images: physical appearance (hair, eyes, face, build, distinctive features, scars/tattoos), clothing, aesthetic, expressions, posture, setting, and mood.',
          'Incorporate these visual elements directly into the persona description (appearance, style, aesthetic, demeanor).',
          'If multiple figures are shown, follow user instructions on which figure represents this persona.',
        ].join(' ')
      : '',
    PERSONA_LENGTH_RULES[input.options.length],
    PERSONA_FORMAT_RULES[input.options.format],
    languageRule(input.locale),
    'Reply with the persona description only: no preface, no comments after it, no quotes or code fences around it.',
  ]
    .filter(Boolean)
    .join('\n')
}

const IMPROVE_PERSONA_DEFAULT =
  'fill the gaps and add vivid concrete details (appearance, quirks, habits, background); keep what is already written'

export function buildPersonaMessages(input: PersonaGenInput, revision?: { draft: string; note: string }): ChatTurn[] {
  if (revision) return buildEditMessages('persona', revision.draft, revision.note, input.images)
  if (input.base !== null)
    return buildEditMessages('persona', input.base, input.description.trim() || IMPROVE_PERSONA_DEFAULT, input.images)

  const text = input.description.trim()
  const fallback = input.images?.length
    ? 'Create a user persona description based on the attached image(s).'
    : ''
  const userText = text || fallback

  let content: string | ContentPart[] = userText
  if (input.images && input.images.length > 0) {
    const pictures: ContentPart[] = input.images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: attachmentUri(img.file) },
    }))
    content = [...pictures, { type: 'text' as const, text: userText }]
  }

  return [
    { role: 'system', content: personaSystemRules(input) },
    { role: 'user', content },
  ]
}

// `thinking` is the switch of the generator sheet, for this request only. An edit runs
// cooler, so the model copies what it should keep instead of inventing it anew.
export async function* streamGeneration(
  cfg: ServerSettings,
  messages: ChatTurn[],
  signal: AbortSignal,
  options: { thinking: boolean; edit: boolean }
): AsyncGenerator<StreamPart> {
  const budget = cfg.contextTokens ? Math.max(cfg.contextTokens - 1500, 4000) : 8192
  const maxTokens = Math.min(budget, 8192)
  const inlined = await withInlinedImages({
    messages,
    temperature: options.thinking ? (options.edit ? 0.7 : 0.8) : (options.edit ? 0.4 : 0.9),
    maxTokens,
    topP: 0.95,
    thinking: options.thinking ? 'on' : 'off',
  })
  yield* streamChat(cfg, inlined, signal)
}

// Models often wrap the answer despite being told not to: a code fence, quotes, or a
// "System prompt:" line in front.
export function cleanGenerated(text: string) {
  let out = text.trim()
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  if (out.includes('</think>')) {
    out = out.slice(out.lastIndexOf('</think>') + '</think>'.length).trim()
  }
  out = out.replace(/^<think>[\s\S]*/gi, '').trim()
  const fence = out.match(/^```[\w-]*\n([\s\S]*?)\n```$/)
  if (fence) out = fence[1].trim()
  out = out.replace(/^(system prompt|системный промпт|промпт|prompt|user persona|persona|персона|описание персоны)\s*:\s*\n?/i, '')
  if (/^["«“].*["»”]$/s.test(out) && !/["«“»”]/.test(out.slice(1, -1))) out = out.slice(1, -1)
  return out.trim()
}

export function countWords(text: string) {
  const words = text.trim().match(/\S+/g)
  return words ? words.length : 0
}
