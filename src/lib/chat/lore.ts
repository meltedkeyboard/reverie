import type { ActiveLorebook } from '@/db/lorebooks'
import { estimateTokens } from '@/lib/core/context'

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const normal = (text: string) => text.toLowerCase().replace(/ё/g, 'е')

// A key is found by its stem, so "дракон" finds "драконы" and "Ривенхолл" finds
// "Ривенхолла": the trailing vowels and soft signs cut while four letters are left. A short
// key is taken only as a word of its own, or "эль" would turn up in "модель".
function mentioned(text: string, key: string) {
  const word = normal(key.trim())
  if (word.length < 2) return false
  const stem = word.replace(/[аеиоуыэюяйьaeiouy]+$/u, '')
  if (stem.length >= 4) return text.includes(stem)
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'u').test(text)
}

// The entries of the books a request draws on that the talk brings up, as a block of the
// system prompt; empty when none does. `scanned` gives the text of the latest `depth`
// messages. An entry marked always comes in regardless; each book keeps to its budget, its
// entries taken in their order.
export function loreBlock(books: ActiveLorebook[], scanned: (depth: number) => string) {
  const picked: string[] = []
  for (const { book, entries } of books) {
    const text = normal(scanned(book.scanDepth))
    let left = book.budget
    for (const entry of entries) {
      const content = entry.content.trim()
      if (!content || picked.includes(content)) continue
      const hit = entry.always || entry.keys.split(',').some((key) => mentioned(text, key))
      if (!hit) continue
      const cost = estimateTokens(content)
      if (cost > left) continue
      left -= cost
      picked.push(content)
    }
  }
  if (!picked.length) return ''
  return [
    'World info: facts of this world that the talk has touched. Use them where they matter; never recite them or mention that they were given.',
    ...picked,
  ].join('\n\n')
}
