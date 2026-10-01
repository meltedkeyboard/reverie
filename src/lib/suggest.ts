import type { Message } from '@/db/messages'
import type { ServerSettings } from '@/db/settings'
import type { AsideScene } from '@/lib/aside'
import { runReplyStream } from '@/lib/replyStream'

// Only the tail of the scene matters for guessing what comes next, and it keeps the
// request fast on a local server.
const TRANSCRIPT_LINES = 6
const LINE_MAX = 800
const MAX_TOKENS = 200

const SYSTEM = [
  'You predict what the user will write next in a roleplay chat.',
  'You get a brief of the scene and a transcript of its latest lines. Write the next message the user would most plausibly send, in the first person, in their voice and in the language of the transcript.',
  'Match the format the user has used so far (actions in asterisks, speech, length). Keep it to one to three sentences.',
  'Reply with the message text only: no quotes around it, no labels, no explanations, and do not write for the characters.',
].join('\n')

// onText gets everything streamed so far, once per frame; the finished text is returned.
export async function suggestReply(
  cfg: ServerSettings,
  scene: AsideScene,
  history: Message[],
  signal: AbortSignal,
  onText: (text: string) => void
) {
  const transcript = history
    .slice(-TRANSCRIPT_LINES)
    .map((m) => `${scene.label(m)}: ${m.content.trim().slice(0, LINE_MAX)}${m.images.length ? ' [photo]' : ''}`.trim())
    .join('\n\n')
  const req = {
    messages: [
      { role: 'system' as const, content: SYSTEM },
      {
        role: 'user' as const,
        content: `Scene brief:\n${scene.brief}\n\n---\n\nTranscript of the latest lines:\n${transcript}\n\n---\n\nWrite the user's next message.`,
      },
    ],
    temperature: 0.8,
    maxTokens: MAX_TOKENS,
    topP: 0.95,
    // A guess needs no thinking, and a model that thinks anyway would burn the short budget.
    thinking: 'off' as const,
  }
  const streamed = await runReplyStream(cfg, req, signal, { onFrame: (frame) => onText(clean(frame.text)) })
  if (streamed.error) throw streamed.error
  return clean(streamed.text) || null
}

function clean(raw: string) {
  // Some templates open <think> themselves, so only the closing tag shows up.
  const parts = raw.split(/<\/think>/i)
  const answer = parts.length > 1 ? parts[parts.length - 1] : raw.replace(/<think>[\s\S]*$/i, '')
  return answer.trim().replace(/^["\u00ab]+|["\u00bb]+$/g, '').trim()
}
