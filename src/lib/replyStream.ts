import { streamChat, type ChatRequest, type ChatTurn, type ContentPart } from '@/api/llm'
import type { Message, Thought } from '@/db/messages'
import type { ServerSettings } from '@/db/settings'
import { imageDataUrl } from '@/lib/images'

export type ReplyFrame = {
  text: string
  thought: string
  // Set once the reply itself starts, which is when the thinking is over.
  thinkingMs: number | null
}

type Callbacks = {
  // Called at most once per screen frame with everything streamed so far.
  onFrame: (frame: ReplyFrame) => void
  // The first visible sign of life: the first thought or the first words of the reply.
  onStart?: () => void
  onFirstWords?: () => void
}

// Streams one reply and hands out what arrived so far once per frame, since chunks come
// faster than the screen refreshes. What was streamed is returned even when the stream
// fails midway; the error is rethrown afterwards through `error`.
export async function runReplyStream(cfg: ServerSettings, req: ChatRequest, signal: AbortSignal, cb: Callbacks) {
  let text = ''
  let thought = ''
  let thinkingSince = 0
  let thinkingMs: number | null = null
  let frame = 0
  let cutoff = false
  let error: unknown = null
  const flush = () => {
    frame = 0
    cb.onFrame({ text, thought, thinkingMs })
  }

  try {
    for await (const part of streamChat(cfg, req, signal)) {
      if (part.kind === 'cutoff') {
        cutoff = true
        continue
      }
      if (part.kind === 'reasoning') {
        if (!thought) {
          cb.onStart?.()
          thinkingSince = Date.now()
        }
        thought += part.text
        if (!frame) frame = requestAnimationFrame(flush)
        continue
      }
      if (thought && thinkingMs === null) thinkingMs = Date.now() - thinkingSince
      const wasEmpty = !text.trim()
      text += part.text
      if (wasEmpty && text.trim()) {
        cb.onStart?.()
        cb.onFirstWords?.()
      }
      if (!frame) frame = requestAnimationFrame(flush)
    }
  } catch (err) {
    error = err
  } finally {
    if (frame) cancelAnimationFrame(frame)
  }
  const kept: Thought | null = thought.trim() ? { text: thought.trim(), ms: thinkingMs ?? Date.now() - thinkingSince } : null
  return { text: text.trim(), thought: kept, error, cutoff }
}

// Why a reply came back empty. Thinking that ran into max_tokens is worth naming: the
// fix is a bigger budget or no thinking, not trying again.
export function emptyReplyReason(streamed: { thought: Thought | null; cutoff: boolean } | null) {
  return streamed?.cutoff && streamed.thought ? 'chat.thinkingOutOfTokens' : 'chat.emptyReply'
}

// Without a cap the system prompt goes out exactly as written. With one, an instruction
// is appended asking the model to keep the reply within that many paragraphs; nothing
// after the fact trims what comes back; a model that ignores it just writes long.
export function withReplyLimit(system: string, limit: number | null): string {
  if (!limit) return system
  const rule = `Keep your reply to at most ${limit} ${limit === 1 ? 'paragraph' : 'paragraphs'}.`
  return system ? `${system}\n\n${rule}` : rule
}

export const CONTINUE_NOTE =
  'Continue the roleplay from where it stopped: develop your last reply further or move the scene forward. Do not repeat what was already said and do not speak for the user.'

export function toTurn(m: Message): ChatTurn {
  if (!m.images.length) return { role: m.role, content: m.content }
  const parts: ContentPart[] = m.images.map((image) => ({
    type: 'image_url',
    image_url: { url: imageDataUrl(image.base64) },
  }))
  if (m.content.trim()) parts.push({ type: 'text', text: m.content })
  return { role: m.role, content: parts }
}
