import { File } from 'expo-file-system'

import type { ChatRequest, ChatTurn } from '@/api/llm'
import type { MessageImage } from '@/db/messages'
import { avatarUri, persistAvatar } from '@/lib/avatarStore'
import { imageDataUrl, pickUris, resizedJpeg, type ImageSource } from '@/lib/images'

// The pictures attached to messages live as files in the `attachments` folder; a message
// keeps only their names (and sizes) in the database.

// Vision models downscale large inputs anyway, and every photo in the context window
// is sent again with each reply, so a smaller picture keeps requests fast.
const MAX_SIDE = 1024

export const attachmentUri = (file: string) => avatarUri(file, 'attachments')!

// Picks pictures and stores them shrunk. A picture the user then takes off the message,
// or never sends, stays behind until the next start sweeps it up (see pruneAttachments).
export async function pickMessageImages(source: ImageSource): Promise<MessageImage[]> {
  const uris = await pickUris(source, true)
  return Promise.all(
    uris.map(async (uri) => {
      const saved = await resizedJpeg(uri, MAX_SIDE, 0.8)
      return { file: await persistAvatar(saved.uri, 'attachments'), width: saved.width, height: saved.height }
    })
  )
}

// A request names pictures by file; the server needs them inline, so the files are read
// just before it is sent.
export async function withInlinedImages(req: ChatRequest): Promise<ChatRequest> {
  const inline = async (turn: ChatTurn): Promise<ChatTurn> => {
    if (typeof turn.content === 'string') return turn
    const content = await Promise.all(
      turn.content.map(async (part) => {
        if (part.type !== 'image_url' || !part.image_url.url.startsWith('file:')) return part
        const file = new File(part.image_url.url)
        const base64 = file.exists ? await file.base64() : ''
        return { type: 'image_url' as const, image_url: { url: imageDataUrl(base64) } }
      })
    )
    return { ...turn, content }
  }
  return { ...req, messages: await Promise.all(req.messages.map(inline)) }
}
