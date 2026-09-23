import type { SQLiteDatabase } from 'expo-sqlite'

export type Role = 'user' | 'assistant'

export type MessageImage = { base64: string; width: number; height: number }

// What a reasoning model thought before answering and for how long.
export type Thought = { text: string; ms: number }

export type Message = {
  id: number
  chatId: number
  role: Role
  content: string
  image: string | null
  imageWidth: number | null
  imageHeight: number | null
  // Every version of the text, the selected one is variants[variant] and equals content.
  variants: string[]
  variant: number
  // Parallel to variants: the reasoning behind each version, null where there was none.
  thoughts: (Thought | null)[]
  createdAt: number
}

type Row = Omit<Message, 'variants' | 'thoughts'> & { variants: string | null; thoughts: string | null }

export const MESSAGE_COLUMNS = `id, chat_id AS chatId, role, content, image, image_width AS imageWidth,
  image_height AS imageHeight, variants, variant, thoughts, created_at AS createdAt`

export type NewMessageExtra = { image?: MessageImage | null; thought?: Thought | null }

// How a message changes is kept apart from where it is stored, so the database and a
// private chat's in-memory store can't drift apart.
export function newMessage(
  id: number,
  chatId: number,
  role: Role,
  content: string,
  { image = null, thought = null }: NewMessageExtra = {},
  createdAt = Date.now()
): Message {
  return {
    id,
    chatId,
    role,
    content,
    image: image?.base64 ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
    variants: [content],
    variant: 0,
    thoughts: [thought],
    createdAt,
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
  return { ...row, variants, thoughts: variants.map((_, i) => thoughts[i] ?? null) }
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
    `INSERT INTO messages (chat_id, role, content, image, image_width, image_height, thoughts, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      chatId,
      role,
      content,
      message.image,
      message.imageWidth,
      message.imageHeight,
      packThoughts(message.thoughts),
      message.createdAt,
    ]
  )
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
