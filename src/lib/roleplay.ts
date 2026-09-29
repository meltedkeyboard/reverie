import { t } from '@/i18n'

// Markdown marks are dropped, so a list shows the words of a reply, not its markup.
export function plainPreview(text: string) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^ {0,3}(#{1,6}|>|[-+*]|\d+[.)])\s+/gm, '')
    .replace(/\*+|~~|`+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// The line under a character's name in the lists: the latest message, or its prompt
// before there is any chat.
export function characterPreview(character: { lastMessage: string | null; systemPrompt: string }) {
  return plainPreview(character.lastMessage ?? character.systemPrompt) || t('characterCard.noDescription')
}
