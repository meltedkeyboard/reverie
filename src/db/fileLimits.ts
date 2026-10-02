import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, getSetting, setFlag, setSetting } from '@/db/settings'
import { DEFAULT_ATTACHMENT_MB, DEFAULT_AVATAR_MB, getFileLimits, setFileLimits } from '@/lib/fileLimits'

const OFF_KEY = 'limits_off'
const AVATAR_KEY = 'limit_avatar_mb'
const ATTACHMENT_KEY = 'limit_attachment_mb'

const stored = (value: string | null, fallback: number) => {
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 1 ? n : fallback
}

// Read at startup and by the Settings screen; also fills the in-memory copy.
export async function loadFileLimits(db: SQLiteDatabase) {
  const limits = {
    off: await getFlag(db, OFF_KEY, false),
    avatarMb: stored(await getSetting(db, AVATAR_KEY), DEFAULT_AVATAR_MB),
    attachmentMb: stored(await getSetting(db, ATTACHMENT_KEY), DEFAULT_ATTACHMENT_MB),
  }
  setFileLimits(limits)
  return limits
}

export async function setLimitsOff(db: SQLiteDatabase, off: boolean) {
  setFileLimits({ ...getFileLimits(), off })
  await setFlag(db, OFF_KEY, off)
}

export async function setAvatarLimitMb(db: SQLiteDatabase, mb: number) {
  setFileLimits({ ...getFileLimits(), avatarMb: mb })
  await setSetting(db, AVATAR_KEY, String(mb))
}

export async function setAttachmentLimitMb(db: SQLiteDatabase, mb: number) {
  setFileLimits({ ...getFileLimits(), attachmentMb: mb })
  await setSetting(db, ATTACHMENT_KEY, String(mb))
}
