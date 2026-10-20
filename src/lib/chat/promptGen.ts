import { streamChat, type ChatTurn, type ContentPart, type StreamPart } from '@/api/llm'
import type { ServerSettings } from '@/db/prefs/settings'
import type { MessageImage } from '@/db/messages'
import type { Locale } from '@/i18n'
import { fitOutput } from '@/lib/core/context'
import { attachmentUri, withInlinedImages } from '@/lib/images/attachments'

export type PromptLength = 'short' | 'medium' | 'long'

export type PromptGenInput = {
  // In 'improve' mode this is the list of requested changes and may be empty. From the
  // questionnaire it is lines of "Field: value".
  description: string
  name: string
  // The prompt already in the editor; set only in 'improve' mode.
  base: string | null
  length: PromptLength
  locale: Locale
  images?: MessageImage[]
}

const LENGTH_RULES: Record<PromptLength, string> = {
  short: 'Keep it compact: about 150-250 words, with two or three sample lines.',
  medium: 'Aim for about 350-550 words, with three or four sample lines.',
  long: 'Be thorough: about 700-1000 words, with more facts about the past and the world, more rules and five to eight sample lines.',
}

// The prompt is an instruction sheet for the model, not a story about the character: a
// model given literary prose writes literary prose back, and an epithet gives it nothing
// to act on. So the rules ask for a dossier of plain facts and behaviors, laid out as a
// hand-written preset is.
const DOSSIER_RULES = [
  'Write it as a dossier the model can act on: short declarative sentences, one fact per line. No metaphors, no epithets, no atmosphere, no adjectives piled up, no narration about the character.',
  'State every trait as behavior. Not "a soul tempered by storms" but "You get angry fast and calm down just as fast. You never apologize first."',
  'Follow this order. The first four parts are plain lines without labels; the last three each get a plain label ending in a colon and a dash list under it. No Markdown headings.',
  '1. Identity: "You are <name>, a <age>-year-old <who>." Occupation, where they live, their situation now.',
  '2. Appearance: a few plain facts (build, hair, eyes, what they usually wear, distinctive marks).',
  '3. Personality: the main traits, each with how it shows; what excites them, what annoys them, their habits.',
  '4. The user: who the user is to the character, their shared history, how the character treats the user, what they do and never do with them. Call the user "the user".',
  '5. "Speech:" register, sentence length, slang, swearing or its absence, verbal habits, and sample lines in quotes, each on its own dash line.',
  '6. "Roleplay formatting:" actions, narration and thoughts in *asterisks*, spoken dialogue in plain text without asterisks; mix actions and dialogue instead of grouping them into blocks; show emotions through actions rather than naming them; no Markdown or lists in replies. End it with a short example reply that alternates *actions* and dialogue.',
  '7. "Rules:" short imperative lines on how to behave in the chat, fitting this character (for example: react before answering, vary sentence length, never speak or act for the user).',
].join('\n')

function systemRules(input: PromptGenInput) {
  const hasImages = (input.images?.length ?? 0) > 0
  return [
    'You write system prompts for roleplay AI characters in a chat app.',
    'The prompt is addressed to the model in the second person ("You are ...") and defines the character the model plays.',
    DOSSIER_RULES,
    'Do not add rules about being an AI or safety disclaimers.',
    input.name.trim()
      ? `The character's name is ${input.name.trim()}.`
      : 'If no name is given, invent one that fits the character.',
    'Every fact the user gives is fixed: keep it exactly. Fill whatever is left out with plausible facts that fit.',
    hasImages
      ? [
          'Reference images are attached to guide the character creation.',
          'Take the visual facts from them: hair, eyes, face, build, distinctive features, clothing, expression, posture, setting and situation.',
          'Put them into the appearance and, where they tell something, into the identity and personality as plain facts.',
          'If the image contains multiple characters, follow the user instructions on which character is the subject of this prompt and who the other character(s) are, and state their relationship plainly.',
        ].join(' ')
      : '',
    LENGTH_RULES[input.length],
    languageRule(input.locale),
    'Reply with the prompt text only: no preface, no comments after it, no quotes or code fences around it.',
  ]
    .filter(Boolean)
    .join('\n')
}

function languageRule(locale: Locale) {
  const fallback = locale === 'en' ? 'English' : 'Russian'
  return `Write in the same language as the user's text. If that is unclear, write in ${fallback}.`
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
  'fill the gaps and remove contradictions by adding concrete facts about how the character behaves and speaks, as plain lines in the style of the text; keep what is written'

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

// `thinking` and both limits are the generator sheet's own, for this request only. An
// edit runs cooler, so the model copies what it should keep instead of inventing it anew.
export async function* streamGeneration(
  cfg: ServerSettings,
  messages: ChatTurn[],
  signal: AbortSignal,
  options: { thinking: boolean; edit: boolean; maxTokens: number; reasoningBudget: number }
): AsyncGenerator<StreamPart> {
  const limits = fitOutput(cfg.contextTokens, messages, options.maxTokens, options.thinking ? options.reasoningBudget : 0)
  const inlined = await withInlinedImages({
    messages,
    temperature: options.thinking ? (options.edit ? 0.7 : 0.8) : (options.edit ? 0.4 : 0.9),
    ...limits,
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
