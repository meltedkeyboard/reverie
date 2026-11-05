import type { SQLiteDatabase } from 'expo-sqlite'

import { defineChoice, defineFlag, getSetting, setFlag, setSetting } from '@/db/prefs/settings'
import { reverieSmb } from '../../../modules/reverie-smb'

// Folder sync keeps its state here, on this device only: app_settings never leaves it.
const ENABLED_KEY = 'folder_sync'
// Set by the triggers of the last migration in schema.ts on any change to the synced tables.
const DIRTY_KEY = 'sync_dirty'
// The revision of the copy in the sync folder this device last matched, pushed or pulled.
const REV_KEY = 'sync_rev'
const SYNCED_AT_KEY = 'sync_at'

const PROVIDER_KEY = 'sync_provider'
const SMB_HOST_KEY = 'smb_host'
const SMB_PORT_KEY = 'smb_port'
const SMB_SHARE_KEY = 'smb_share'
const SMB_PATH_KEY = 'smb_path'
const SMB_USER_KEY = 'smb_user'
const SMB_DOMAIN_KEY = 'smb_domain'
const SMB_WIFI_ONLY_KEY = 'smb_wifi_only'
const SMB_LABEL_KEY = 'smb_label'
const SMB_SECRET_FALLBACK_KEY = 'smb_secret'

export type SyncProvider = 'folder' | 'smb'

export type SmbSettings = {
  host: string
  port: number
  share: string
  path: string
  username: string
  domain: string
  wifiOnly: boolean
  label: string
}

export const DEFAULT_SMB_SETTINGS: SmbSettings = {
  host: '',
  port: 445,
  share: '',
  path: 'Reverie Sync',
  username: '',
  domain: 'WORKGROUP',
  wifiOnly: true,
  label: '',
}

const cloudSync = defineFlag(ENABLED_KEY, false)
const syncProvider = defineChoice<SyncProvider>(PROVIDER_KEY, ['folder', 'smb'], 'folder')

export const isCloudSyncEnabled = cloudSync.load
export const setCloudSyncEnabled = cloudSync.save
export const getSyncProvider = syncProvider.load
export const setSyncProvider = syncProvider.save

export async function getSmbSettings(db: SQLiteDatabase): Promise<SmbSettings> {
  const [host, port, share, path, username, domain, wifiOnly, label] = await Promise.all([
    getSetting(db, SMB_HOST_KEY),
    getSetting(db, SMB_PORT_KEY),
    getSetting(db, SMB_SHARE_KEY),
    getSetting(db, SMB_PATH_KEY),
    getSetting(db, SMB_USER_KEY),
    getSetting(db, SMB_DOMAIN_KEY),
    getSetting(db, SMB_WIFI_ONLY_KEY),
    getSetting(db, SMB_LABEL_KEY),
  ])
  return {
    host: host ?? DEFAULT_SMB_SETTINGS.host,
    port: port ? Number(port) : DEFAULT_SMB_SETTINGS.port,
    share: share ?? DEFAULT_SMB_SETTINGS.share,
    path: path ?? DEFAULT_SMB_SETTINGS.path,
    username: username ?? DEFAULT_SMB_SETTINGS.username,
    domain: domain ?? DEFAULT_SMB_SETTINGS.domain,
    wifiOnly: wifiOnly === null ? DEFAULT_SMB_SETTINGS.wifiOnly : wifiOnly === '1',
    label: label ?? DEFAULT_SMB_SETTINGS.label,
  }
}

export async function saveSmbSettings(db: SQLiteDatabase, s: Partial<SmbSettings>) {
  const updates: Promise<void>[] = []
  if (s.host !== undefined) updates.push(setSetting(db, SMB_HOST_KEY, s.host))
  if (s.port !== undefined) updates.push(setSetting(db, SMB_PORT_KEY, String(s.port)))
  if (s.share !== undefined) updates.push(setSetting(db, SMB_SHARE_KEY, s.share))
  if (s.path !== undefined) updates.push(setSetting(db, SMB_PATH_KEY, s.path))
  if (s.username !== undefined) updates.push(setSetting(db, SMB_USER_KEY, s.username))
  if (s.domain !== undefined) updates.push(setSetting(db, SMB_DOMAIN_KEY, s.domain))
  if (s.wifiOnly !== undefined) updates.push(setFlag(db, SMB_WIFI_ONLY_KEY, s.wifiOnly))
  if (s.label !== undefined) updates.push(setSetting(db, SMB_LABEL_KEY, s.label))
  await Promise.all(updates)
}

export async function getSmbPassword(db: SQLiteDatabase): Promise<string> {
  try {
    const keychainSecret = await reverieSmb?.getPassword('smb_password')
    if (keychainSecret !== undefined && keychainSecret !== null) return keychainSecret
  } catch {}
  return (await getSetting(db, SMB_SECRET_FALLBACK_KEY)) ?? ''
}

export async function saveSmbPassword(db: SQLiteDatabase, secret: string) {
  try {
    if (reverieSmb) {
      if (secret) await reverieSmb.savePassword('smb_password', secret)
      else await reverieSmb.deletePassword('smb_password')
      return
    }
  } catch {}
  if (secret) await setSetting(db, SMB_SECRET_FALLBACK_KEY, secret)
  else await db.runAsync('DELETE FROM app_settings WHERE key = ?', SMB_SECRET_FALLBACK_KEY)
}

export async function getSyncState(db: SQLiteDatabase) {
  const [dirty, rev, syncedAt] = await Promise.all([getSetting(db, DIRTY_KEY), getSetting(db, REV_KEY), getSetting(db, SYNCED_AT_KEY)])
  return { dirty: dirty === '1', rev, syncedAt: syncedAt ? Number(syncedAt) : null }
}

export function setDirty(db: SQLiteDatabase, dirty: boolean) {
  return setFlag(db, DIRTY_KEY, dirty)
}

export async function markSynced(db: SQLiteDatabase, rev: string) {
  await setSetting(db, REV_KEY, rev)
  await setFlag(db, DIRTY_KEY, false)
  await setSetting(db, SYNCED_AT_KEY, String(Date.now()))
}

export function markChecked(db: SQLiteDatabase) {
  return setSetting(db, SYNCED_AT_KEY, String(Date.now()))
}

// After a new folder is picked, what is in it has nothing to do with the revision this
// device knew, so the first sync treats both sides as changed.
export async function forgetSyncRev(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM app_settings WHERE key IN (?, ?)', [REV_KEY, SYNCED_AT_KEY])
}
