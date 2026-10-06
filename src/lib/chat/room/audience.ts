import type { Message } from '@/db/messages'
import type { RoomMember } from '@/db/rooms'

// Stands for the user in a message's addressees.
export const USER = 0

export type Hearing = 'direct' | 'overheard' | null

// Whether a character knows about a message: it was said openly, to them, by them, or
// they overheard a whisper meant for someone else. Nobody hears what was said while they
// were out of the scene. The user hears everything.
export function hearing(message: Message, characterId: number): Hearing {
  if (message.speakerId === characterId) return 'direct'
  if (message.absent.includes(characterId)) return null
  if (!message.audience || message.audience.includes(characterId)) return 'direct'
  if (message.overheard.includes(characterId)) return 'overheard'
  return null
}

// Rolled once, when the message is saved, so the history does not change between
// requests. Muted members listen too, so they can overhear as well; those out of the
// scene can't.
export function rollEavesdrop(audience: number[] | null, members: RoomMember[], speakerId: number | null) {
  if (!audience) return []
  return members
    .filter(
      (m) =>
        m.present && m.characterId !== speakerId && !audience.includes(m.characterId) && Math.random() < m.perception
    )
    .map((m) => m.characterId)
}

export function absentIds(members: RoomMember[]) {
  return members.filter((m) => !m.present).map((m) => m.characterId)
}
