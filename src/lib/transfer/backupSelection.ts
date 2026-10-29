// What goes into a backup or comes out of one: a tree of groups with their characters,
// characters with their chats, rooms with their scenes and the user's personas, and the set
// of ticked nodes. No UI and no database here.

export type TreeChat = { id: number; title: string | null; messageCount: number }
// `avatar` is a stored file (the export), `avatarUri` a picture read out of the backup (the import).
// `archived`: a character in the archive, marked so in the tree.
export type TreeNode = { id: number; name: string; avatar?: string | null; avatarUri?: string | null; archived?: boolean; chats: TreeChat[] }
// A persona's `chats` are the ones held in it, and `owners` the same chats under the characters
// and rooms they belong to, for the sheet to show them as a tree. `exists` marks one the
// device already has (the import then takes that one instead).
export type PersonaOwner = { branch: 'characters' | 'rooms'; node: TreeNode; chats: TreeChat[] }
export type TreePersona = TreeNode & { isDefault: boolean; owners: PersonaOwner[]; exists?: boolean }
// `members` are among `characters` too; a group is only a way to tick several at once.
export type TreeGroup = { id: number; name: string | null; members: TreeNode[] }
export type BackupTree = { characters: TreeNode[]; groups: TreeGroup[]; rooms: TreeNode[]; personas: TreePersona[] }

// `keepGroups: false` takes the characters alone, out of their groups; left out, they keep them.
export type Selection = { characters: Set<number>; rooms: Set<number>; chats: Set<number>; personas: Set<number>; keepGroups?: boolean }

export type Branch = 'characters' | 'rooms' | 'personas'
export type CheckState = 'all' | 'some' | 'none'

type Source = {
  characters: { id: number; name: string; avatar?: string | null; archivedAt?: number | null; group?: { id: number; name: string | null } | null }[]
  rooms?: { id: number; name: string }[]
  // `messageCount` when the caller already has it (SQL), else it is counted from `messages`.
  chats?: { id: number; characterId: number | null; roomId?: number | null; personaId?: number | null; title: string | null; messageCount?: number }[]
  messages?: { chatId: number }[]
  // Backups from before personas leave it out.
  personas?: { id: number; name: string; avatar?: string | null; isDefault?: boolean | number }[]
}

export function buildTree(source: Source): BackupTree {
  const counts = new Map<number, number>()
  for (const message of source.messages ?? []) counts.set(message.chatId, (counts.get(message.chatId) ?? 0) + 1)
  const byCharacter = new Map<number, TreeChat[]>()
  const byRoom = new Map<number, TreeChat[]>()
  const personaOf = new Map<number, number>()
  for (const chat of source.chats ?? []) {
    if (chat.personaId) personaOf.set(chat.id, chat.personaId)
    const entry = { id: chat.id, title: chat.title, messageCount: chat.messageCount ?? counts.get(chat.id) ?? 0 }
    const owner = chat.roomId ? byRoom : byCharacter
    const ownerId = chat.roomId ? chat.roomId : chat.characterId
    if (ownerId === null) continue
    owner.set(ownerId, [...(owner.get(ownerId) ?? []), entry])
  }
  const characters = source.characters.map(({ id, name, avatar, archivedAt }) => ({ id, name, avatar, archived: Boolean(archivedAt), chats: byCharacter.get(id) ?? [] }))
  // In the order of their characters; one that came with a single member is no group.
  const groups = new Map<number, TreeGroup>()
  source.characters.forEach(({ group }, index) => {
    if (!group) return
    const entry = groups.get(group.id) ?? { id: group.id, name: group.name, members: [] }
    entry.members.push(characters[index])
    groups.set(group.id, entry)
  })
  const rooms = (source.rooms ?? []).map(({ id, name }) => ({ id, name, chats: byRoom.get(id) ?? [] }))
  // Under each persona its chats' owners in the order of their sections, each with only the
  // chats held in that persona.
  const personas = (source.personas ?? []).map(({ id, name, avatar, isDefault }) => {
    const owners: PersonaOwner[] = []
    const add = (branch: PersonaOwner['branch'], node: TreeNode) => {
      const chats = node.chats.filter((chat) => personaOf.get(chat.id) === id)
      if (chats.length) owners.push({ branch, node, chats })
    }
    for (const node of characters) add('characters', node)
    for (const node of rooms) add('rooms', node)
    return { id, name, avatar, isDefault: Boolean(isDefault), owners, chats: owners.flatMap((owner) => owner.chats) }
  })
  return { characters, groups: [...groups.values()].filter((g) => g.members.length > 1), rooms, personas }
}

// What the characters section shows top down: a group where its first member is, with all
// its members in it, and the characters of no group as they come.
export type CharacterEntry = { kind: 'group'; group: TreeGroup } | { kind: 'character'; node: TreeNode }

export function characterEntries(tree: BackupTree): CharacterEntry[] {
  const groupOf = new Map<number, TreeGroup>()
  for (const group of tree.groups) for (const member of group.members) groupOf.set(member.id, group)
  const placed = new Set<number>()
  return tree.characters.flatMap((node): CharacterEntry[] => {
    const group = groupOf.get(node.id)
    if (!group) return [{ kind: 'character', node }]
    if (placed.has(group.id)) return []
    placed.add(group.id)
    return [{ kind: 'group', group }]
  })
}

export function selectAll(tree: BackupTree): Selection {
  const chats = new Set<number>()
  for (const node of [...tree.characters, ...tree.rooms]) for (const chat of node.chats) chats.add(chat.id)
  return {
    characters: new Set(tree.characters.map((c) => c.id)),
    rooms: new Set(tree.rooms.map((r) => r.id)),
    chats,
    personas: new Set(tree.personas.map((p) => p.id)),
    keepGroups: true,
  }
}

export function selectNone(): Selection {
  return { characters: new Set(), rooms: new Set(), chats: new Set(), personas: new Set(), keepGroups: true }
}

const copy = (selection: Selection): Selection => ({
  characters: new Set(selection.characters),
  rooms: new Set(selection.rooms),
  chats: new Set(selection.chats),
  personas: new Set(selection.personas),
  keepGroups: selection.keepGroups,
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

// A group ticks all its characters with their chats, or clears them all when every one was ticked.
export function toggleGroup(selection: Selection, group: TreeGroup): Selection {
  const next = copy(selection)
  const on = groupState(selection, group) !== 'all'
  for (const member of group.members) {
    if (on) next.characters.add(member.id)
    else next.characters.delete(member.id)
    for (const chat of member.chats) {
      if (on) next.chats.add(chat.id)
      else next.chats.delete(chat.id)
    }
  }
  return next
}

export function groupState(selection: Selection, group: TreeGroup): CheckState {
  const states = group.members.map((member) => nodeState(selection, 'characters', member))
  if (states.every((state) => state === 'all')) return 'all'
  return states.every((state) => state === 'none') ? 'none' : 'some'
}

export function membersSelected(selection: Selection, group: TreeGroup) {
  return group.members.filter((member) => selection.characters.has(member.id)).length
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

// A persona on its own comes with its chats ticked too (and their owners). Cleared, only the
// persona goes: its chats still come, without it.
export function togglePersona(selection: Selection, persona: TreePersona): Selection {
  const next = copy(selection)
  if (next.personas.delete(persona.id)) return next
  next.personas.add(persona.id)
  for (const owner of persona.owners) {
    next[owner.branch].add(owner.node.id)
    for (const chat of owner.chats) next.chats.add(chat.id)
  }
  return next
}

// A character or room under a persona stands for just the chats held in it: they are ticked
// (with the persona and the owner) or cleared together, the owner's other chats left alone.
export function togglePersonaOwner(selection: Selection, persona: TreePersona, owner: PersonaOwner): Selection {
  const next = copy(selection)
  if (ownerState(selection, owner) === 'all') {
    for (const chat of owner.chats) next.chats.delete(chat.id)
    return next
  }
  next.personas.add(persona.id)
  next[owner.branch].add(owner.node.id)
  for (const chat of owner.chats) next.chats.add(chat.id)
  return next
}

// A chat ticked under a persona brings the persona along as well as its owner.
export function togglePersonaChat(selection: Selection, persona: TreePersona, owner: PersonaOwner, chatId: number): Selection {
  const next = toggleChat(selection, owner.branch, owner.node, chatId)
  if (next.chats.has(chatId)) next.personas.add(persona.id)
  return next
}

export function ownerState(selection: Selection, owner: PersonaOwner): CheckState {
  if (!selection[owner.branch].has(owner.node.id)) return 'none'
  const ticked = owner.chats.filter((chat) => selection.chats.has(chat.id)).length
  return ticked === owner.chats.length ? 'all' : ticked ? 'some' : 'none'
}

export function nodeState(selection: Selection, branch: Branch, node: TreeNode): CheckState {
  if (!selection[branch].has(node.id)) return 'none'
  return node.chats.every((chat) => selection.chats.has(chat.id)) ? 'all' : 'some'
}

export function chatsSelected(selection: Selection, node: TreeNode) {
  return node.chats.filter((chat) => selection.chats.has(chat.id)).length
}

export function isEmpty(selection: Selection) {
  return selection.characters.size === 0 && selection.rooms.size === 0 && selection.personas.size === 0
}

// The parts of a backup the selection keeps. Members of a room whose character is not
// ticked are dropped, and so is everything that belongs to an unticked chat. A chat whose
// persona is not ticked comes without one.
export function applySelection<
  T extends {
    characters: { id: number }[]
    rooms?: { id: number }[]
    roomMembers?: { roomId: number; characterId: number }[]
    chats: { id: number; characterId: number | null; roomId?: number | null; personaId?: number | null }[]
    messages: { chatId: number }[]
    personas?: { id: number }[]
  },
>(dump: T, selection: Selection): T {
  const characters = dump.characters.filter((c) => selection.characters.has(c.id))
  const rooms = dump.rooms?.filter((r) => selection.rooms.has(r.id))
  const roomMembers = dump.roomMembers?.filter((m) => selection.rooms.has(m.roomId) && selection.characters.has(m.characterId))
  const personas = dump.personas?.filter((p) => selection.personas.has(p.id))
  const chats = (dump.chats ?? [])
    .filter((chat) => {
      if (!selection.chats.has(chat.id)) return false
      return chat.roomId ? selection.rooms.has(chat.roomId) : chat.characterId !== null && selection.characters.has(chat.characterId)
    })
    .map((chat) => (chat.personaId && !selection.personas.has(chat.personaId) ? { ...chat, personaId: null } : chat))
  const kept = new Set(chats.map((chat) => chat.id))
  const messages = (dump.messages ?? []).filter((message) => kept.has(message.chatId))
  return { ...dump, characters, rooms, roomMembers, chats, messages, personas }
}
