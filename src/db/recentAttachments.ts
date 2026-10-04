import type { SQLiteDatabase } from 'expo-sqlite'

import { defineFlag, getFlag, getSetting, positiveInt, setFlag, setSetting } from '@/db/settings'

// The row of the latest pictures sent, at the top of the attach menu. On unless turned off
// in Settings; how many it shows is a number there, or no limit at all.
const ENABLED_KEY = 'recent_attachments'
const COUNT_KEY = 'recent_attachments_count'
const UNLIMITED_KEY = 'recent_attachments_unlimited'

export const DEFAULT_RECENT_COUNT = 8

const recentAttachments = defineFlag(ENABLED_KEY, true)

export const isRecentAttachmentsEnabled = recentAttachments.load
export const setRecentAttachmentsEnabled = recentAttachments.save

export type RecentSettings = { count: number; unlimited: boolean }

export async function loadRecentSettings(db: SQLiteDatabase): Promise<RecentSettings> {
  return {
    count: positiveInt(await getSetting(db, COUNT_KEY), DEFAULT_RECENT_COUNT),
    unlimited: await getFlag(db, UNLIMITED_KEY, false),
  }
}

export function setRecentCount(db: SQLiteDatabase, count: number) {
  return setSetting(db, COUNT_KEY, String(count))
}

export function setRecentUnlimited(db: SQLiteDatabase, unlimited: boolean) {
  return setFlag(db, UNLIMITED_KEY, unlimited)
}
