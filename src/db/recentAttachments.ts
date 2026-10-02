import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, getSetting, setFlag, setSetting } from '@/db/settings'

// The row of the latest pictures sent, at the top of the attach menu. On unless turned off
// in Settings; how many it shows is a number there, or no limit at all.
const ENABLED_KEY = 'recent_attachments'
const COUNT_KEY = 'recent_attachments_count'
const UNLIMITED_KEY = 'recent_attachments_unlimited'

export const DEFAULT_RECENT_COUNT = 8

export function isRecentAttachmentsEnabled(db: SQLiteDatabase) {
  return getFlag(db, ENABLED_KEY, true)
}

export function setRecentAttachmentsEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setFlag(db, ENABLED_KEY, enabled)
}

export type RecentSettings = { count: number; unlimited: boolean }

export async function loadRecentSettings(db: SQLiteDatabase): Promise<RecentSettings> {
  const n = Number(await getSetting(db, COUNT_KEY))
  return {
    count: Number.isSafeInteger(n) && n >= 1 ? n : DEFAULT_RECENT_COUNT,
    unlimited: await getFlag(db, UNLIMITED_KEY, false),
  }
}

export function setRecentCount(db: SQLiteDatabase, count: number) {
  return setSetting(db, COUNT_KEY, String(count))
}

export function setRecentUnlimited(db: SQLiteDatabase, unlimited: boolean) {
  return setFlag(db, UNLIMITED_KEY, unlimited)
}
