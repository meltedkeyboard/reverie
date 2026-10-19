import type { SQLiteDatabase } from 'expo-sqlite'
import type { ComponentProps } from 'react'

import type { Composer } from '@/components/chat/Composer'
import type { RowMessage, RowScene } from '@/components/chat/MessageRow'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import type { Character } from '@/db/characters'
import { createChat, getLatestChatId, listChats, type Chat, type ChatPreview } from '@/db/chats'
import type { Message } from '@/db/messages'
import { createRoomChat, getLatestRoomChatId, listRoomChats, type Room, type RoomMember } from '@/db/rooms'
import { regenerateTargetAt } from '@/hooks/chat/useChat'
import type { MessageAction } from '@/lib/chat/messageActions'

// Whose chats a chat screen switches between: a character's chats, or a room's scenes.
// Everything else about the screen, its two threads and the drawer, is the same for both.
export type Owner =
  | { kind: 'character'; character: Character }
  | { kind: 'room'; room: Room; members: RoomMember[] }

// The picture and the look of the bubbles come from the character or the room.
export const lookOf = (owner: Owner) => (owner.kind === 'character' ? owner.character : owner.room)

export const ownerKey = (owner: Owner) => (owner.kind === 'character' ? `character:${owner.character.id}` : `room:${owner.room.id}`)

export function createChatOf(db: SQLiteDatabase, owner: Owner) {
  return owner.kind === 'character' ? createChat(db, owner.character) : createRoomChat(db, owner.room)
}

// Where the owner opens, and what takes the place of a deleted chat: the chat written in last.
export function latestChatOf(db: SQLiteDatabase, owner: Owner) {
  return owner.kind === 'character' ? getLatestChatId(db, owner.character.id) : getLatestRoomChatId(db, owner.room.id)
}

// The chats of the drawer. A scene's last line says who said it.
export async function listChatsOf(db: SQLiteDatabase, owner: Owner): Promise<ChatPreview[]> {
  if (owner.kind === 'character') return listChats(db, owner.character.id)
  const scenes = await listRoomChats(db, owner.room.id)
  return scenes.map((chat) => ({
    ...chat,
    lastMessage: chat.lastSpeaker && chat.lastMessage ? `${chat.lastSpeaker}: ${chat.lastMessage}` : chat.lastMessage,
  }))
}

// The replies that can be written again: in a chat any but the greeting, in a room the
// lines of someone still in it.
export function regenerableOf(owner: Owner, messages: Message[]) {
  if (owner.kind === 'character') return new Set(messages.filter((_, i) => regenerateTargetAt(messages, i)).map((m) => m.id))
  const cast = new Set(owner.members.map((m) => m.characterId))
  return new Set(
    messages
      .filter((m) => m.role === 'assistant' && m.kind !== 'narration' && m.speakerId !== null && cast.has(m.speakerId))
      .map((m) => m.id)
  )
}

// What a message row needs beyond its message. In a room, who said a line and to whom.
export type RowConfig = {
  regenerable: ReadonlySet<number>
  locked: boolean
  onAction: (message: RowMessage, action: MessageAction) => void
  onSelectVariant: (id: number, variant: number) => void
  bubbleOpacity: number
  sceneOf?: (message: Message) => RowScene
}

// What one of the two threads shows: a chat's rows, from the chat's controller once it is
// the one on screen, or straight from the database while it is laid out ahead.
export type ThreadData = {
  chat: Chat | null
  rows: RowMessage[]
  loaded: boolean
  config: RowConfig
  error: string | null
  onRetry: () => void
  focusId: number | null
}

// What the controller of the chat on screen hands the header and the composer.
export type ChromeData = {
  chatId: number
  title: string | null
  naming: boolean
  fresh: boolean
  chatMenu: MenuItem[]
  asideOpen: boolean
  toggleAside: () => void
  composer: Omit<ComponentProps<typeof Composer>, 'height' | 'top' | 'resetKey'>
}

export const noop = () => {}

export const EMPTY_CONFIG: RowConfig = {
  regenerable: new Set(),
  locked: false,
  onAction: noop,
  onSelectVariant: noop,
  bubbleOpacity: 1,
}

export const EMPTY_THREAD: ThreadData = { chat: null, rows: [], loaded: false, config: EMPTY_CONFIG, error: null, onRetry: noop, focusId: null }
