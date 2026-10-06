import type { ChatTurn } from '@/api/llm'

// The slider in Settings moves between these; the stored value is the token count.
export const CONTEXT_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144] as const
export const DEFAULT_CONTEXT_TOKENS = 8192

// 'messages' is the first way: a fixed number of the latest messages. 'tokens' fills a
// window of the size set in Settings.
export type ContextMode = 'messages' | 'tokens'
export const CONTEXT_MODES: readonly ContextMode[] = ['messages', 'tokens']
export const CHAT_MESSAGES = 20
// More than a one-on-one chat: several people talk, so the same stretch of scene takes more lines.
export const ROOM_MESSAGES = 30

// What the template and the notes added after the history take, beyond what is counted.
const MARGIN = 256
// A picture costs about this much whatever its size; servers differ, so it is a guess.
const IMAGE_TOKENS = 700

// No tokenizer: Russian runs about 3.5 characters to a token, English more, so the
// estimate leans to the Russian side and errs toward sending less.
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.5)
}

export function turnTokens(turn: ChatTurn) {
  if (typeof turn.content === 'string') return estimateTokens(turn.content) + 4
  return turn.content.reduce((sum, p) => sum + (p.type === 'text' ? estimateTokens(p.text) : IMAGE_TOKENS), 4)
}

// The newest turns that fit what the window leaves after the system prompt and the room
// kept for the reply. The last turn is always kept, so a small window never sends nothing.
export function fitHistory<T>(
  items: T[],
  cost: (item: T) => number,
  { contextTokens, system, maxTokens }: { contextTokens: number; system: string; maxTokens: number }
) {
  let left = contextTokens - maxTokens - estimateTokens(system) - MARGIN
  let from = items.length
  while (from > 0) {
    left -= cost(items[from - 1])
    if (left < 0 && from < items.length) break
    from--
  }
  return items.slice(from)
}

type Window = { contextMode: ContextMode; contextTokens: number }

// The history a request carries, by the mode chosen in Settings; `messages` is how many
// the first mode keeps.
export function selectHistory<T>(
  items: T[],
  cost: (item: T) => number,
  cfg: Window,
  { messages, system, maxTokens }: { messages: number; system: string; maxTokens: number }
) {
  if (cfg.contextMode === 'messages') return items.slice(-messages)
  return fitHistory(items, cost, { contextTokens: cfg.contextTokens, system, maxTokens })
}
