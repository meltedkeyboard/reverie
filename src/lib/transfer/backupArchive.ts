import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'

// A backup is a zip you can open on a computer:
//   manifest.json            what and when, the server address
//   characters/<id>-<name>.json
//   rooms/<id>-<name>.json   the room with its members
//   chats/<id>-<title>.json  the chat with its messages
//   avatars/<file>, backgrounds/<file>   the pictures as they are, originals included
//   attachments/<file>   the pictures attached to messages (a message lists their names)
// Only the folders matter to the reader; the names after the id are there for people.

type WithId = { id: number }

export type ArchiveParts = {
  manifest: object
  characters: (WithId & { name: string })[]
  rooms: (WithId & { name: string })[]
  roomMembers: { roomId: number }[]
  chats: (WithId & { title: string | null })[]
  messages: { chatId: number }[]
  // Every picture by its path in the zip ("avatars/1.jpg").
  files: { path: string; bytes: Uint8Array }[]
}

export type OpenedArchive = Omit<ArchiveParts, 'files' | 'manifest'> & {
  manifest: Record<string, unknown>
  file: (path: string) => Uint8Array | undefined
}

const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2))

function fileName(id: number, label: string | null) {
  const clean = (label ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 40).trim()
  return clean ? `${id}-${clean}.json` : `${id}.json`
}

function groupBy<T>(items: T[], key: (item: T) => number) {
  const groups = new Map<number, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

export function packArchive(parts: ArchiveParts) {
  const files: Zippable = { 'manifest.json': json(parts.manifest) }
  for (const character of parts.characters) files[`characters/${fileName(character.id, character.name)}`] = json(character)
  const members = groupBy(parts.roomMembers, (m) => m.roomId)
  for (const room of parts.rooms) files[`rooms/${fileName(room.id, room.name)}`] = json({ ...room, members: members.get(room.id) ?? [] })
  const messages = groupBy(parts.messages, (m) => m.chatId)
  for (const chat of parts.chats) files[`chats/${fileName(chat.id, chat.title)}`] = json({ ...chat, messages: messages.get(chat.id) ?? [] })
  // Pictures are compressed already; storing them is faster and no bigger.
  for (const file of parts.files) files[file.path] = [file.bytes, { level: 0 }]
  return zipSync(files)
}

export const isArchive = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b

// Throws when the bytes are not a zip or a file in it is not JSON.
export function unpackArchive(bytes: Uint8Array): OpenedArchive {
  const files = unzipSync(bytes)
  const folder = (name: string) =>
    Object.keys(files)
      .filter((path) => path.startsWith(`${name}/`) && path.endsWith('.json'))
      .map((path) => JSON.parse(strFromU8(files[path])))
  const byId = (a: WithId, b: WithId) => a.id - b.id

  const rooms = folder('rooms').sort(byId)
  const chats = folder('chats').sort(byId)
  return {
    manifest: files['manifest.json'] ? JSON.parse(strFromU8(files['manifest.json'])) : {},
    characters: folder('characters').sort(byId),
    rooms: rooms.map(({ members: _members, ...room }) => room),
    roomMembers: rooms.flatMap((room) => room.members ?? []),
    chats: chats.map(({ messages: _messages, ...chat }) => chat),
    messages: chats.flatMap((chat) => chat.messages ?? []),
    file: (path) => files[path],
  }
}
