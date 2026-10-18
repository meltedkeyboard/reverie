import type { SQLiteDatabase } from 'expo-sqlite'
import { removeAvatar } from '@/lib/images/avatars'

export type Persona = {
  id: number
  name: string
  avatar: string | null
  avatarOriginal: string | null
  avatarCrop: string | null
  description: string
  isDefault: boolean
  sortOrder: number
  createdAt: number
}

export type PersonaFields = {
  name: string
  avatar?: string | null
  avatarOriginal?: string | null
  avatarCrop?: string | null
  description?: string
  isDefault?: boolean
}

export const PERSONA_COLUMNS =
  'p.id, p.name, p.avatar, p.avatar_original AS avatarOriginal, p.avatar_crop AS avatarCrop, p.description, p.is_default AS isDefault, p.sort_order AS sortOrder, p.created_at AS createdAt'

const listeners = new Set<() => void>()

export function onPersonasChanged(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function notifyPersonasChanged() {
  for (const fn of listeners) {
    try {
      fn()
    } catch (err) {
      console.warn('Persona change listener threw', err)
    }
  }
}

export async function listPersonas(db: SQLiteDatabase): Promise<Persona[]> {
  const rows = await db.getAllAsync<{
    id: number
    name: string
    avatar: string | null
    avatarOriginal: string | null
    avatarCrop: string | null
    description: string
    isDefault: number
    sortOrder: number
    createdAt: number
  }>(`SELECT ${PERSONA_COLUMNS} FROM personas p ORDER BY p.sort_order DESC, p.id DESC`)
  return rows.map((r) => ({
    ...r,
    isDefault: !!r.isDefault,
  }))
}

export async function getPersona(db: SQLiteDatabase, id: number): Promise<Persona | null> {
  const row = await db.getFirstAsync<{
    id: number
    name: string
    avatar: string | null
    avatarOriginal: string | null
    avatarCrop: string | null
    description: string
    isDefault: number
    sortOrder: number
    createdAt: number
  }>(`SELECT ${PERSONA_COLUMNS} FROM personas p WHERE p.id = ?`, id)
  if (!row) return null
  return {
    ...row,
    isDefault: !!row.isDefault,
  }
}

export async function getDefaultPersona(db: SQLiteDatabase): Promise<Persona | null> {
  const row = await db.getFirstAsync<{
    id: number
    name: string
    avatar: string | null
    avatarOriginal: string | null
    avatarCrop: string | null
    description: string
    isDefault: number
    sortOrder: number
    createdAt: number
  }>(`SELECT ${PERSONA_COLUMNS} FROM personas p WHERE p.is_default = 1 ORDER BY p.id DESC LIMIT 1`)
  if (!row) return null
  return {
    ...row,
    isDefault: !!row.isDefault,
  }
}

// The bare row, for callers inside a transaction of their own (the backup import): the
// default is not cleared from the others and nobody is told.
export async function insertPersona(db: SQLiteDatabase, fields: PersonaFields, createdAt = Date.now()): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO personas (name, avatar, avatar_original, avatar_crop, description, is_default, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.name.trim(),
      fields.avatar ?? null,
      fields.avatarOriginal ?? null,
      fields.avatarCrop ?? null,
      (fields.description ?? '').trim(),
      fields.isDefault ? 1 : 0,
      createdAt,
    ]
  )
  return res.lastInsertRowId
}

export async function createPersona(db: SQLiteDatabase, fields: PersonaFields): Promise<number> {
  let id = 0
  await db.withTransactionAsync(async () => {
    if (fields.isDefault) {
      await db.runAsync('UPDATE personas SET is_default = 0')
    }
    id = await insertPersona(db, fields)
  })
  notifyPersonasChanged()
  return id
}

export async function updatePersona(db: SQLiteDatabase, id: number, fields: PersonaFields): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (fields.isDefault) {
      await db.runAsync('UPDATE personas SET is_default = 0 WHERE id != ?', id)
    }
    await db.runAsync(
      `UPDATE personas
       SET name = ?, avatar = ?, avatar_original = ?, avatar_crop = ?, description = ?, is_default = ?
       WHERE id = ?`,
      [
        fields.name.trim(),
        fields.avatar ?? null,
        fields.avatarOriginal ?? null,
        fields.avatarCrop ?? null,
        (fields.description ?? '').trim(),
        fields.isDefault ? 1 : 0,
        id,
      ]
    )
  })
  notifyPersonasChanged()
}

export async function deletePersona(db: SQLiteDatabase, id: number): Promise<void> {
  const current = await getPersona(db, id)
  if (current?.avatar) {
    try {
      removeAvatar(current.avatar)
    } catch {}
  }
  if (current?.avatarOriginal) {
    try {
      removeAvatar(current.avatarOriginal)
    } catch {}
  }

  await db.runAsync('DELETE FROM personas WHERE id = ?', id)
  notifyPersonasChanged()
}

export async function setDefaultPersona(db: SQLiteDatabase, id: number | null): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE personas SET is_default = 0')
    if (id !== null) {
      await db.runAsync('UPDATE personas SET is_default = 1 WHERE id = ?', id)
    }
  })
  notifyPersonasChanged()
}

export async function setChatPersona(db: SQLiteDatabase, chatId: number, personaId: number | null): Promise<void> {
  await db.runAsync('UPDATE chats SET persona_id = ? WHERE id = ?', [personaId, chatId])
}
