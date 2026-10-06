import type { Locale } from '@/i18n'
import { t } from '@/i18n'

export function formatWhen(timestamp: number, locale: Locale) {
  const date = new Date(timestamp)
  const now = new Date()
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  if (sameDay(date, now)) return `${t('format.today')}, ${time}`
  if (sameDay(date, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `${t('format.yesterday')}, ${time}`
  const month = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { month: 'short' }).format(date)
  const day = `${date.getDate()} ${month}`
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Russian has three plural forms, English two; `ru` and `en` each supply exactly
// what their grammar needs.
export function plural(count: number, locale: Locale, ru: [one: string, few: string, many: string], en: [one: string, many: string]) {
  if (locale === 'en') return count === 1 ? en[0] : en[1]
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return ru[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return ru[1]
  return ru[2]
}

// The nouns that get counted, with their forms in each language.
const UNITS = {
  chat: { ru: ['чат', 'чата', 'чатов'], en: ['chat', 'chats'] },
  scene: { ru: ['сцена', 'сцены', 'сцен'], en: ['scene', 'scenes'] },
  message: { ru: ['сообщение', 'сообщения', 'сообщений'], en: ['message', 'messages'] },
  word: { ru: ['слово', 'слова', 'слов'], en: ['word', 'words'] },
  paragraph: { ru: ['абзац', 'абзаца', 'абзацев'], en: ['paragraph', 'paragraphs'] },
  line: { ru: ['реплика', 'реплики', 'реплик'], en: ['line', 'lines'] },
} as const satisfies Record<string, { ru: [string, string, string]; en: [string, string] }>

export type CountUnit = keyof typeof UNITS

// "3 chats" / "3 чата"
export function countLabel(count: number, unit: CountUnit, locale: Locale) {
  const { ru, en } = UNITS[unit]
  return `${count} ${plural(count, locale, [...ru] as [string, string, string], [...en] as [string, string])}`
}
