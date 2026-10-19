import type { ChatTurn } from '@/api/llm'

// The context slider in Settings steps by 1,000 tokens (1K).
export const MIN_CONTEXT_TOKENS = 1000
export const MAX_CONTEXT_TOKENS = 256000
export const CONTEXT_STEP_TOKENS = 1000
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

// What a request with a fixed prompt may ask for: the reply and the thinking budget as
// set, both cut down by the same share when together they would not fit the window
// after the prompt.
export function fitOutput(contextTokens: number, messages: ChatTurn[], maxTokens: number, reasoningBudget: number) {
  const room = contextTokens - messages.reduce((sum, turn) => sum + turnTokens(turn), 0) - MARGIN
  const wanted = maxTokens + reasoningBudget
  if (wanted <= room) return { maxTokens, reasoningBudget }
  const share = Math.max(room, 0) / wanted
  // A window too small for the prompt is the server's to report; the request still asks for something.
  return { maxTokens: Math.max(Math.floor(maxTokens * share), 64), reasoningBudget: Math.floor(reasoningBudget * share) }
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

// Window settings for history selection: contextTokens is the fundamental budget,
// and limitMessages optionally caps the candidate history to the latest messages.
type Window = { contextTokens: number; limitMessages?: boolean; contextMode?: ContextMode }

// The history a request carries: fits within the token budget `contextTokens`.
// If `limitMessages` is on and `messages` is given, only the latest `messages` items are considered.
export function selectHistory<T>(
  items: T[],
  cost: (item: T) => number,
  cfg: Window,
  { messages, system, maxTokens }: { messages?: number; system: string; maxTokens: number }
) {
  const shouldLimit = cfg.limitMessages ?? (cfg.contextMode === 'messages')
  const capped = shouldLimit && typeof messages === 'number' && messages > 0 ? items.slice(-messages) : items
  return fitHistory(capped, cost, { contextTokens: cfg.contextTokens, system, maxTokens })
}

export function formatTokensLabel(tokens: number): string {
  if (tokens >= 1000 && tokens % 1000 === 0) {
    return `${tokens / 1000}K`
  }
  if (tokens >= 1024 && tokens % 1024 === 0) {
    return `${tokens / 1024}K`
  }
  if (tokens >= 1000) {
    return `${Number((tokens / 1000).toFixed(1))}K`
  }
  return String(tokens)
}

export function formatContextTokens(tokens: number): string {
  const short = formatTokensLabel(tokens)
  const formattedCount = tokens >= 1000 ? String(tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(tokens)
  return `${short} (${formattedCount})`
}
