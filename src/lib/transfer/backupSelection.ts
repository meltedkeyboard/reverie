// What goes into a backup or comes out of one: a tree of characters with their chats and
// rooms with their scenes, and the set of ticked nodes. No UI and no database here.

export type TreeChat = { id: number; title: string | null; messageCount: number }
// `avatar` is a stored file (the export), `avatarUri` a picture read out of the backup (the import).
export type TreeNode = { id: number; name: string; avatar?: string | null; avatarUri?: string | null; chats: TreeChat[] }
export type BackupTree = { characters: TreeNode[]; rooms: TreeNode[] }

export type Selection = { characters: Set<number>; rooms: Set<number>; chats: Set<number> }

export type Branch = 'characters' | 'rooms'
export type CheckState = 'all' | 'some' | 'none'

type Source = {
  characters: { id: number; name: string; avatar?: string | null }[]
  rooms?: { id: number; name: string }[]
  // `messageCount` when the caller already has it (SQL), else it is counted from `messages`.
  chats?: { id: number; characterId: number | null; roomId?: number | null; title: string | null; messageCount?: number }[]
  messages?: { chatId: number }[]
}

export function buildTree(source: Source): BackupTree {
  const counts = new Map<number, number>()
  for (const message of source.messages ?? []) counts.set(message.chatId, (counts.get(message.chatId) ?? 0) + 1)
  const byCharacter = new Map<number, TreeChat[]>()
  const byRoom = new Map<number, TreeChat[]>()
  for (const chat of source.chats ?? []) {
    const entry = { id: chat.id, title: chat.title, messageCount: chat.messageCount ?? counts.get(chat.id) ?? 0 }
    const owner = chat.roomId ? byRoom : byCharacter
    const ownerId = chat.roomId ? chat.roomId : chat.characterId
    if (ownerId === null) continue
    owner.set(ownerId, [...(owner.get(ownerId) ?? []), entry])
  }
  return {
    characters: source.characters.map(({ id, name, avatar }) => ({ id, name, avatar, chats: byCharacter.get(id) ?? [] })),
    rooms: (source.rooms ?? []).map(({ id, name }) => ({ id, name, chats: byRoom.get(id) ?? [] })),
  }
}

export function selectAll(tree: BackupTree): Selection {
  const chats = new Set<number>()
  for (const node of [...tree.characters, ...tree.rooms]) for (const chat of node.chats) chats.add(chat.id)
  return { characters: new Set(tree.characters.map((c) => c.id)), rooms: new Set(tree.rooms.map((r) => r.id)), chats }
}

export function selectNone(): Selection {
  return { characters: new Set(), rooms: new Set(), chats: new Set() }
}

const copy = (selection: Selection): Selection => ({
  characters: new Set(selection.characters),
  rooms: new Set(selection.rooms),
  chats: new Set(selection.chats),
})

// Ticking a parent ticks all its chats, clearing it clears them (a chat cannot go without its owner).
export function toggleNode(selection: Selection, branch: Branch, node: TreeNode): Selection {
  const next = copy(selection)
  if (next[branch].has(node.id)) {
    next[branch].delete(node.id)
    for (const chat of node.chats) next.chats.delete(chat.id)
  } else {
    next[branch].add(node.id)
    for (const chat of node.chats) next.chats.add(chat.id)
  }
  return next
}

// Ticking a chat ticks its owner too.
export function toggleChat(selection: Selection, branch: Branch, node: TreeNode, chatId: number): Selection {
  const next = copy(selection)
  if (next.chats.has(chatId)) next.chats.delete(chatId)
  else {
    next.chats.add(chatId)
    next[branch].add(node.id)
  }
  return next
}

export function nodeState(selection: Selection, branch: Branch, node: TreeNode): CheckState {
  if (!selection[branch].has(node.id)) return 'none'
  return node.chats.every((chat) => selection.chats.has(chat.id)) ? 'all' : 'some'
}

export function chatsSelected(selection: Selection, node: TreeNode) {
  return node.chats.filter((chat) => selection.chats.has(chat.id)).length
}

export function isEmpty(selection: Selection) {
  return selection.characters.size === 0 && selection.rooms.size === 0
}

// The parts of a backup the selection keeps. Members of a room whose character is not
// ticked are dropped, and so is everything that belongs to an unticked chat.
export function applySelection<
  T extends {
    characters: { id: number }[]
    rooms?: { id: number }[]
    roomMembers?: { roomId: number; characterId: number }[]
    chats: { id: number; characterId: number | null; roomId?: number | null }[]
    messages: { chatId: number }[]
  },
>(dump: T, selection: Selection): T {
  const characters = dump.characters.filter((c) => selection.characters.has(c.id))
  const rooms = dump.rooms?.filter((r) => selection.rooms.has(r.id))
  const roomMembers = dump.roomMembers?.filter((m) => selection.rooms.has(m.roomId) && selection.characters.has(m.characterId))
  const chats = (dump.chats ?? []).filter((chat) => {
    if (!selection.chats.has(chat.id)) return false
    return chat.roomId ? selection.rooms.has(chat.roomId) : chat.characterId !== null && selection.characters.has(chat.characterId)
  })
  const kept = new Set(chats.map((chat) => chat.id))
  const messages = (dump.messages ?? []).filter((message) => kept.has(message.chatId))
  return { ...dump, characters, rooms, roomMembers, chats, messages }
}
