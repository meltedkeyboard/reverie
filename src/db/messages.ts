import type { SQLiteDatabase } from 'expo-sqlite'

import { notifyChatsChanged } from '@/lib/chat/chatEvents'

export type Role = 'user' | 'assistant'

// A picture of a message: the name of its file in the `attachments` folder.
// A moving picture (GIF, animated WebP/APNG) keeps its own file in `moving`, shown in the chat
// and the viewer; `file` stays the still that the model gets.
export type MessageImage = { file: string; width: number; height: number; moving?: string }

// What a reasoning model thought before answering and for how long.
export type Thought = { text: string; ms: number }

// 'reaction' is a short aside from someone who was not asked; 'narration' is the user
// describing the scene instead of speaking in it.
export type MessageKind = 'say' | 'reaction' | 'narration'

export type Message = {
  id: number
  chatId: number
  role: Role
  content: string
  images: MessageImage[]
  // Every version of the text, the selected one is variants[variant] and equals content.
  variants: string[]
  variant: number
  // Parallel to variants: the reasoning behind each version, null where there was none.
  thoughts: (Thought | null)[]
  createdAt: number
  // The rest only means something in a room. speakerId is the character who said an
  // assistant line (null in a one-on-one chat, or once that character is deleted).
  speakerId: number | null
  kind: MessageKind
  // Character ids the line is aimed at, 0 standing for the user; null is everyone.
  addressees: number[] | null
  // Character ids who can hear it; null is everyone. The user always hears everything.
  audience: number[] | null
  // Characters outside the audience who overheard it anyway.
  overheard: number[]
  // Characters who were out of the scene when it was said; they never learn of it.
  absent: number[]
}

type Row = Omit<Message, 'variants' | 'thoughts' | 'images' | 'addressees' | 'audience' | 'overheard' | 'absent'> & {
  images: string | null
  variants: string | null
  thoughts: string | null
  addressees: string | null
  audience: string | null
  overheard: string | null
  absent: string | null
}

export const MESSAGE_COLUMNS = `id, chat_id AS chatId, role, content, images, variants, variant, thoughts, created_at AS createdAt,
  speaker_id AS speakerId, kind, addressees, audience, overheard, absent`

// The columns copied as they are when a chat is duplicated or moved.
export const MESSAGE_COPY_COLUMNS =
  'role, content, images, variants, variant, thoughts, created_at, speaker_id, kind, addressees, audience, overheard, absent'

export type NewMessageExtra = {
  images?: MessageImage[]
  thought?: Thought | null
  speakerId?: number | null
  kind?: MessageKind
  addressees?: number[] | null
  audience?: number[] | null
  overheard?: number[]
  absent?: number[]
}

// How a message changes is kept apart from where it is stored, so the database rows and
// the draft row of a streaming reply are built the same way.
export function newMessage(
  id: number,
  chatId: number,
  role: Role,
  content: string,
  {
    images = [],
    thought = null,
    speakerId = null,
    kind = 'say',
    addressees = null,
    audience = null,
    overheard = [],
    absent = [],
  }: NewMessageExtra = {},
  createdAt = Date.now()
): Message {
  return {
    id,
    chatId,
    role,
    content,
    images,
    variants: [content],
    variant: 0,
    thoughts: [thought],
    createdAt,
    speakerId,
    kind,
    addressees,
    audience,
    overheard,
    absent,
  }
}

// Rewrites the selected version.
export function withContent(message: Message, content: string): Message {
  return { ...message, content, variants: message.variants.map((text, i) => (i === message.variant ? content : text)) }
}

// Adds a version and selects it.
export function withNewVariant(message: Message, content: string, thought: Thought | null = null): Message {
  return {
    ...message,
    content,
    variants: [...message.variants, content],
    variant: message.variants.length,
    thoughts: [...message.thoughts, thought],
  }
}

export function withVariant(message: Message, variant: number): Message {
  return { ...message, content: message.variants[variant], variant }
}

function fromRow(row: Row): Message {
  const variants: string[] = row.variants ? JSON.parse(row.variants) : [row.content]
  const thoughts: (Thought | null)[] = row.thoughts ? JSON.parse(row.thoughts) : []
  const images: MessageImage[] = row.images ? JSON.parse(row.images) : []
  return {
    ...row,
    images,
    variants,
    thoughts: variants.map((_, i) => thoughts[i] ?? null),
    addressees: row.addressees ? JSON.parse(row.addressees) : null,
    audience: row.audience ? JSON.parse(row.audience) : null,
    overheard: row.overheard ? JSON.parse(row.overheard) : [],
    absent: row.absent ? JSON.parse(row.absent) : [],
  }
}

export function packIds(ids: number[] | null) {
  return ids ? JSON.stringify(ids) : null
}

// For the lists that are empty far more often than not.
function packSome(ids: number[]) {
  return ids.length ? JSON.stringify(ids) : null
}

// A message without pictures keeps the column empty.
function packImages(images: MessageImage[]) {
  return images.length ? JSON.stringify(images) : null
}

// A message with a single version keeps the column empty instead of a one-item array.
function packVariants(variants: string[]) {
  return variants.length > 1 ? JSON.stringify(variants) : null
}

function packThoughts(thoughts: (Thought | null)[]) {
  return thoughts.some(Boolean) ? JSON.stringify(thoughts) : null
}

export async function listMessages(db: SQLiteDatabase, chatId: number) {
  const rows = await db.getAllAsync<Row>(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE chat_id = ? ORDER BY id ASC`, chatId)
  return rows.map(fromRow)
}

export async function addMessage(db: SQLiteDatabase, chatId: number, role: Role, content: string, extra?: NewMessageExtra) {
  const message = newMessage(0, chatId, role, content, extra)
  const res = await db.runAsync(
    `INSERT INTO messages (chat_id, role, content, images, thoughts, created_at, speaker_id, kind, addressees, audience, overheard, absent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      chatId,
      role,
      content,
      packImages(message.images),
      packThoughts(message.thoughts),
      message.createdAt,
      message.speakerId,
      message.kind,
      packIds(message.addressees),
      packIds(message.audience),
      packSome(message.overheard),
      packSome(message.absent),
    ]
  )
  notifyChatsChanged()
  return { ...message, id: res.lastInsertRowId }
}

export async function updateMessage(db: SQLiteDatabase, message: Message, content: string) {
  const next = withContent(message, content)
  await db.runAsync('UPDATE messages SET content = ?, variants = ? WHERE id = ?', [
    content,
    packVariants(next.variants),
    message.id,
  ])
  return next
}

export async function addVariant(db: SQLiteDatabase, message: Message, content: string, thought: Thought | null = null) {
  const next = withNewVariant(message, content, thought)
  await db.runAsync('UPDATE messages SET content = ?, variants = ?, variant = ?, thoughts = ? WHERE id = ?', [
    content,
    packVariants(next.variants),
    next.variant,
    packThoughts(next.thoughts),
    message.id,
  ])
  return next
}

export async function selectVariant(db: SQLiteDatabase, message: Message, variant: number) {
  const next = withVariant(message, variant)
  await db.runAsync('UPDATE messages SET content = ?, variant = ? WHERE id = ?', [next.content, variant, message.id])
  return next
}

export async function deleteMessage(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM messages WHERE id = ?', id)
}
