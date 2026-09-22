const MONTHS = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']

export function formatWhen(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  if (sameDay(date, now)) return `Сегодня, ${time}`
  if (sameDay(date, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `Вчера, ${time}`
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
