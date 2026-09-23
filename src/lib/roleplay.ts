import { t } from '@/i18n'

export type Span = { text: string; action: boolean }

export function splitRoleplay(text: string) {
  const spans: Span[] = []
  let action = false
  let buf = ''

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '*') {
      buf += text[i]
      continue
    }
    if (buf) spans.push({ text: buf, action })
    buf = ''
    action = !action
    while (text[i + 1] === '*') i++
  }
  if (buf) spans.push({ text: buf, action })
  return spans
}

export function plainPreview(text: string) {
  return text.replace(/\*+/g, '').replace(/\s+/g, ' ').trim()
}

// The line under a character's name in the lists: the latest message, or its prompt
// before there is any chat.
export function characterPreview(character: { lastMessage: string | null; systemPrompt: string }) {
  return plainPreview(character.lastMessage ?? character.systemPrompt) || t('characterCard.noDescription')
}
