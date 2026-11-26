import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate'

// A backup is a zip you can open on a computer:
//   manifest.json            what and when, the server address
//   characters/<id>-<name>.json
//   rooms/<id>-<name>.json   the room with its members
//   chats/<id>-<title>.json  the chat with its messages
//   personas/<id>-<name>.json   the user's personas (chats point at them by id)
//   lorebooks/<id>-<name>.json  a lorebook with its entries and the characters and rooms using it
//   avatars/<file>, backgrounds/<file>   the pictures as they are, originals included
//   attachments/<file>   the pictures attached to messages (a message lists their names)
//   gallery/<file>       the pictures and videos of characters' galleries (a character lists them)
// Only the folders matter to the reader; the names after the id are there for people.

type WithId = { id: number }

export type ArchiveFile = {
  path: string
  size?: number
  bytes?: Uint8Array
  read?: () => Promise<Uint8Array | null>
}

export type ArchiveParts = {
  manifest: object
  characters: (WithId & { name: string })[]
  rooms: (WithId & { name: string })[]
  roomMembers: { roomId: number }[]
  chats: (WithId & { title: string | null })[]
  messages: { chatId: number }[]
  personas: (WithId & { name: string })[]
  lorebooks: (WithId & { name: string })[]
  // Every picture by its path in the zip ("avatars/1.jpg").
  files: ArchiveFile[]
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

const MEDIA_CHUNK_BYTES = 512 * 1024
const YIELD_INTERVAL_MS = 16

const yieldTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function concatChunks(chunks: Uint8Array[]) {
  let total = 0
  for (const chunk of chunks) total += chunk.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export async function packArchive(parts: ArchiveParts, onProgress?: (ratio: number) => void): Promise<Uint8Array> {
  const members = groupBy(parts.roomMembers, (m) => m.roomId)
  const messages = groupBy(parts.messages, (m) => m.chatId)
  const jsonEntries: { path: string; data: unknown }[] = [
    { path: 'manifest.json', data: parts.manifest },
    ...parts.characters.map((c) => ({ path: `characters/${fileName(c.id, c.name)}`, data: c })),
    ...parts.rooms.map((r) => ({ path: `rooms/${fileName(r.id, r.name)}`, data: { ...r, members: members.get(r.id) ?? [] } })),
    ...parts.chats.map((ch) => ({ path: `chats/${fileName(ch.id, ch.title)}`, data: { ...ch, messages: messages.get(ch.id) ?? [] } })),
    ...parts.personas.map((p) => ({ path: `personas/${fileName(p.id, p.name)}`, data: p })),
    ...parts.lorebooks.map((b) => ({ path: `lorebooks/${fileName(b.id, b.name)}`, data: b })),
  ]

  let mediaTotal = 0
  for (const file of parts.files) mediaTotal += file.size ?? file.bytes?.length ?? 0
  const estJsonBytes = Math.max(16384, jsonEntries.length * 4096 + parts.messages.length * 500)
  const totalWeight = estJsonBytes + mediaTotal
  const jsonShare = totalWeight > 0 ? estJsonBytes / totalWeight : 1

  const chunks: Uint8Array[] = []
  let zipError: unknown = null
  let finished = false
  let doneResolve: (() => void) | null = null
  const donePromise = new Promise<void>((resolve) => {
    doneResolve = resolve
  })

  const zip = new Zip((err, chunk, final) => {
    if (err) {
      zipError = err
      doneResolve?.()
      return
    }
    if (chunk && chunk.length) chunks.push(chunk)
    if (final) {
      finished = true
      doneResolve?.()
    }
  })

  let lastYield = Date.now()
  const maybeYield = async () => {
    if (!onProgress && parts.files.length < 20 && parts.messages.length < 1000) return
    if (Date.now() - lastYield >= YIELD_INTERVAL_MS) {
      await yieldTick()
      lastYield = Date.now()
    }
  }

  for (let i = 0; i < jsonEntries.length; i++) {
    const item = jsonEntries[i]
    const entry = new ZipDeflate(item.path)
    zip.add(entry)
    entry.push(json(item.data), true)
    if (zipError) throw zipError
    onProgress?.(jsonShare * ((i + 1) / jsonEntries.length))
    await maybeYield()
  }

  // Pictures are compressed already; storing them is faster and no bigger.
  let mediaDone = 0
  for (const file of parts.files) {
    const bytes = file.bytes ?? (file.read ? await file.read() : null)
    if (!bytes) {
      mediaDone += file.size ?? 0
      onProgress?.(jsonShare + (1 - jsonShare) * (mediaTotal ? mediaDone / mediaTotal : 1))
      continue
    }
    const entry = new ZipPassThrough(file.path)
    zip.add(entry)
    if (bytes.length === 0) {
      entry.push(bytes, true)
    } else {
      for (let offset = 0; offset < bytes.length; offset += MEDIA_CHUNK_BYTES) {
        const end = Math.min(bytes.length, offset + MEDIA_CHUNK_BYTES)
        entry.push(bytes.subarray(offset, end), end === bytes.length)
        if (zipError) throw zipError
        mediaDone += end - offset
        onProgress?.(jsonShare + (1 - jsonShare) * (mediaTotal ? Math.min(1, mediaDone / mediaTotal) : 1))
        await maybeYield()
      }
    }
    if (zipError) throw zipError
  }

  zip.end()
  if (!finished && !zipError) await donePromise
  if (zipError) throw zipError
  return concatChunks(chunks)
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
    // Backups from before personas have no such folder.
    personas: folder('personas').sort(byId),
    // And before lorebooks.
    lorebooks: folder('lorebooks').sort(byId),
    file: (path) => files[path],
  }
}
