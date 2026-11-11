import * as Network from 'expo-network'
import { Directory, File, Paths } from 'expo-file-system'
import { deserializeDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'

import {
  getSmbPassword,
  getSmbSettings,
  getSyncProvider,
  getSyncState,
  isAutoSyncEnabled,
  markChecked,
  markSynced,
  setDirty,
  type SyncProvider,
} from '@/db/prefs/cloudSync'
import { migrate, SCHEMA_VERSION } from '@/db/schema'
import { t } from '@/i18n'
import { convertLegacyAttachments } from '@/db/attachments'
import { avatarUri, type ImageKind } from '@/lib/images/avatarStore'
import { dataDirectory, databaseDirectory, keepCopy } from '@/lib/core/storage'
import { isWeb } from '@/lib/core/platform'
import { cloudFolder } from '../../../modules/reverie-cloud-folder'
import { reverieSmb, type SmbConfig } from '../../../modules/reverie-smb'

// Sync with a folder the user picked (iCloud Drive, Google Drive, local) or an SMB server,
// as whole snapshots. The destination holds:
//
//   manifest.json          which revision is there; written last, so it is the commit point
//   reverie.db             the database without app_settings (API key, this device's flags)
//   avatars/, backgrounds/ the pictures the database points at, by their unique names
//
// A device remembers the revision it last pushed or pulled and whether anything changed
// since (sync_dirty, set by triggers). Only one side changed: that side wins. Both did:
// the user picks one, and the data here is put aside first if it is the one that loses.
// The database in the folder is never opened in place: SQLite over a synced file corrupts.

export const cloudSyncAvailable = cloudFolder !== null || reverieSmb !== null || __DEV__

export type SyncOutcome = 'pushed' | 'pulled' | 'unchanged' | 'conflict' | 'behind' | 'empty'

export type SyncMode = 'auto' | 'push-only' | 'push' | 'pull' | 'local' | 'cloud'

export type SyncStage =
  | 'idle'
  | 'uploading_media'
  | 'downloading_media'
  | 'done'

export type SyncProgress = {
  active: boolean
  stage: SyncStage
  current?: number
  total?: number
}

let currentProgress: SyncProgress = { active: false, stage: 'idle' }
let progressTimer: ReturnType<typeof setTimeout> | undefined
const progressListeners = new Set<() => void>()

export function getSyncProgress(): SyncProgress {
  return currentProgress
}

export function subscribeSyncProgress(fn: () => void): () => void {
  progressListeners.add(fn)
  return () => {
    progressListeners.delete(fn)
  }
}

export function setSyncProgress(progress: SyncProgress) {
  clearTimeout(progressTimer)
  currentProgress = progress
  progressListeners.forEach((fn) => fn())
}

export type SyncBackend = {
  list(path: string): Promise<string[]>
  copyIn(path: string, localUri: string): Promise<void>
  copyOut(localUri: string, path: string): Promise<void>
  remove(path: string): Promise<void>
}

type Manifest = { app: 'reverie'; rev: string; schema: number; savedAt: number }

const MANIFEST = 'manifest.json'
const DATABASE = 'reverie.db'
const IMAGE_KINDS: ImageKind[] = ['avatars', 'backgrounds', 'attachments', 'gallery']
const TABLES = ['characters', 'character_gallery', 'rooms', 'room_members', 'chats', 'messages', 'lorebooks', 'lore_entries', 'lorebook_links']
const ORDERED_TABLES = ['characters', 'rooms', 'chats']

async function getBackend(db: SQLiteDatabase, mode: SyncMode): Promise<SyncBackend | null> {
  const provider = await getSyncProvider(db)
  if (provider === 'smb') {
    const smb = reverieSmb
    if (!smb) throw new Error(t('sync.unavailable'))
    const settings = await getSmbSettings(db)
    if (!settings.host.trim() || !settings.share.trim()) {
      if (mode === 'auto' || mode === 'push-only') return null
      throw new Error(t('sync.smbNotConfigured'))
    }
    const password = await getSmbPassword(db)
    const config: SmbConfig = {
      host: settings.host.trim(),
      port: settings.port,
      share: settings.share.trim(),
      path: settings.path.trim(),
      username: settings.username.trim(),
      password,
      domain: settings.domain.trim(),
    }
    if (settings.wifiOnly && !isWeb) {
      const net = await Network.getNetworkStateAsync().catch(() => null)
      const isCellular = net?.type === Network.NetworkStateType.CELLULAR
      if (isCellular) {
        if (mode === 'auto' || mode === 'push-only') return null
        const reachable = await smb.testConnection(config).then((r) => r.ok).catch(() => false)
        if (!reachable) {
          throw new Error(t('sync.wifiRequired'))
        }
      }
    }
    return {
      list: (p) => smb.list(config, p),
      copyIn: (p, localUri) => smb.copyIn(config, p, localUri),
      copyOut: (localUri, p) => smb.copyOut(config, localUri, p),
      remove: (p) => smb.remove(config, p),
    }
  }

  if (!cloudFolder) throw new Error(t('sync.unavailable'))
  return cloudFolder
}

function workFile(name: string) {
  const dir = new Directory(Paths.cache, 'folder-sync')
  dir.create({ intermediates: true, idempotent: true })
  return new File(dir, name)
}

function plainPath(uri: string) {
  return decodeURIComponent(uri.replace(/^file:\/\//, '').replace(/\/$/, ''))
}

function sqlPath(file: File) {
  return `'${plainPath(file.uri).replace(/'/g, "''")}'`
}

function freshFile(name: string) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = workFile(name + suffix)
    if (file.exists) file.delete()
  }
  return workFile(name)
}

function newRev() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function withAttached<T>(db: SQLiteDatabase, file: File, schema: string, body: () => Promise<T>) {
  await db.execAsync(`ATTACH ${sqlPath(file)} AS ${schema}`)
  try {
    return await body()
  } finally {
    await db.execAsync(`DETACH ${schema}`)
  }
}

async function referencedImages(db: SQLiteDatabase, schema: string) {
  const rows = await db.getAllAsync<{ name: string; kind: ImageKind }>(
    `SELECT avatar AS name, 'avatars' AS kind FROM ${schema}.characters WHERE avatar IS NOT NULL
     UNION SELECT avatar_original, 'avatars' FROM ${schema}.characters WHERE avatar_original IS NOT NULL
     UNION SELECT background, 'backgrounds' FROM ${schema}.characters WHERE background IS NOT NULL
     UNION SELECT background_original, 'backgrounds' FROM ${schema}.characters WHERE background_original IS NOT NULL
     UNION SELECT file, 'gallery' FROM ${schema}.character_gallery
     UNION SELECT background, 'backgrounds' FROM ${schema}.rooms WHERE background IS NOT NULL
     UNION SELECT background_original, 'backgrounds' FROM ${schema}.rooms WHERE background_original IS NOT NULL
     UNION SELECT json_extract(j.value, '$.file'), 'attachments'
       FROM ${schema}.messages m, json_each(m.images) j WHERE m.images IS NOT NULL AND json_valid(m.images)
     UNION SELECT json_extract(j.value, '$.moving'), 'attachments'
       FROM ${schema}.messages m, json_each(m.images) j WHERE m.images IS NOT NULL AND json_valid(m.images)`
  )
  const images: Record<ImageKind, Set<string>> = { avatars: new Set(), backgrounds: new Set(), attachments: new Set(), gallery: new Set() }
  for (const row of rows) if (row.name) images[row.kind].add(row.name)
  return images
}

async function readManifest(backend: SyncBackend): Promise<Manifest | null> {
  const names = await backend.list('')
  if (!names.includes(MANIFEST)) return null
  const file = workFile(MANIFEST)
  await backend.copyIn(MANIFEST, file.uri)
  let manifest: Manifest
  try {
    manifest = JSON.parse(await file.text())
  } catch {
    throw new Error(t('sync.corrupted'))
  }
  if (manifest.app !== 'reverie' || typeof manifest.rev !== 'string') throw new Error(t('sync.corrupted'))
  return manifest
}

async function isEmpty(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ n: number }>('SELECT (SELECT COUNT(*) FROM characters) + (SELECT COUNT(*) FROM rooms) AS n')
  return !row?.n
}

async function makeSnapshot(db: SQLiteDatabase, snapshot: File) {
  if (isWeb) {
    const copy = await deserializeDatabaseAsync(await db.serializeAsync('main'))
    try {
      await copy.execAsync('DELETE FROM app_settings')
      const images = await referencedImages(copy, 'main')
      snapshot.writeSync(await copy.serializeAsync('main'))
      return images
    } finally {
      await copy.closeAsync()
    }
  }
  await db.execAsync(`VACUUM INTO ${sqlPath(snapshot)}`)
  return withAttached(db, snapshot, 'snap', async () => {
    await db.execAsync('PRAGMA snap.secure_delete = ON; DELETE FROM snap.app_settings;')
    return referencedImages(db, 'snap')
  })
}

async function push(db: SQLiteDatabase, backend: SyncBackend): Promise<boolean> {
  await setDirty(db, false)
  try {
    const snapshot = freshFile('outgoing.db')
    const images = await makeSnapshot(db, snapshot)

    const stale: string[] = []
    const toUpload: { uri: string; dest: string }[] = []
    for (const kind of IMAGE_KINDS) {
      const there = new Set(await backend.list(kind))
      for (const name of images[kind]) {
        if (there.has(name)) continue
        const local = new File(avatarUri(name, kind)!)
        if (local.exists) toUpload.push({ uri: local.uri, dest: `${kind}/${name}` })
      }
      for (const name of there) if (!images[kind].has(name)) stale.push(`${kind}/${name}`)
    }

    const hadFiles = toUpload.length > 0
    if (hadFiles) {
      for (let i = 0; i < toUpload.length; i++) {
        setSyncProgress({
          active: true,
          stage: 'uploading_media',
          current: i + 1,
          total: toUpload.length,
        })
        await backend.copyOut(toUpload[i].uri, toUpload[i].dest)
      }
    }

    await backend.copyOut(snapshot.uri, DATABASE)
    const manifest: Manifest = { app: 'reverie', rev: newRev(), schema: SCHEMA_VERSION, savedAt: Date.now() }
    const manifestFile = workFile(MANIFEST)
    manifestFile.create({ overwrite: true })
    manifestFile.writeSync(JSON.stringify(manifest))
    await backend.copyOut(manifestFile.uri, MANIFEST)
    await markSynced(db, manifest.rev)
    snapshot.delete()

    for (const path of stale) await backend.remove(path).catch(() => {})
    return hadFiles
  } catch (err) {
    await setDirty(db, true)
    throw err
  }
}

async function copyImagesIn(backend: SyncBackend, images: Record<ImageKind, Set<string>>): Promise<boolean> {
  const toDownload: { src: string; dest: string }[] = []
  for (const kind of IMAGE_KINDS) {
    const dir = new Directory(dataDirectory(), kind)
    dir.create({ intermediates: true, idempotent: true })
    for (const name of images[kind]) {
      if (new File(avatarUri(name, kind)!).exists) continue
      toDownload.push({ src: `${kind}/${name}`, dest: new File(dir, name).uri })
    }
  }

  const hadFiles = toDownload.length > 0
  if (hadFiles) {
    for (let i = 0; i < toDownload.length; i++) {
      setSyncProgress({
        active: true,
        stage: 'downloading_media',
        current: i + 1,
        total: toDownload.length,
      })
      await backend.copyIn(toDownload[i].src, toDownload[i].dest)
    }
  }
  return hadFiles
}

async function replaceRows(db: SQLiteDatabase, manifest: Manifest, copyTable: (table: string) => Promise<void>) {
  await db.execAsync('BEGIN IMMEDIATE')
  try {
    for (const table of [...TABLES].reverse()) await db.execAsync(`DELETE FROM main.${table}`)
    for (const table of TABLES) await copyTable(table)
    await markSynced(db, manifest.rev)
    await db.execAsync('COMMIT')
  } catch (err) {
    await db.execAsync('ROLLBACK')
    throw err
  }
}

async function pullInMemory(db: SQLiteDatabase, manifest: Manifest, incoming: File, backend: SyncBackend): Promise<boolean> {
  const copy = await deserializeDatabaseAsync(await incoming.bytes())
  try {
    const row = await copy.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    const version = row?.user_version ?? 0
    if (version > SCHEMA_VERSION) throw new Error(t('sync.newerApp'))
    if (version < SCHEMA_VERSION) await migrate(copy)

    const hadFiles = await copyImagesIn(backend, await referencedImages(copy, 'main'))
    await replaceRows(db, manifest, async (table) => {
      const rows = await copy.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`)
      if (!rows.length) return
      const columns = Object.keys(rows[0])
      const insert = await db.prepareAsync(
        `INSERT INTO main.${table} (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
      )
      try {
        for (const r of rows) await insert.executeAsync(columns.map((c) => r[c] as never))
      } finally {
        await insert.finalizeAsync()
      }
      if (ORDERED_TABLES.includes(table)) {
        for (const r of rows) await db.runAsync(`UPDATE main.${table} SET sort_order = ? WHERE id = ?`, r.sort_order as never, r.id as never)
      }
    })
    await convertLegacyAttachments(db)
    return hadFiles
  } finally {
    await copy.closeAsync()
  }
}

async function pull(db: SQLiteDatabase, backend: SyncBackend, manifest: Manifest): Promise<boolean> {
  const incoming = freshFile('incoming.db')
  await backend.copyIn(DATABASE, incoming.uri)
  if (isWeb) {
    const hadFiles = await pullInMemory(db, manifest, incoming, backend)
    incoming.delete()
    return hadFiles
  }

  const copy = await openDatabaseAsync(incoming.name, { useNewConnection: true }, plainPath(incoming.parentDirectory.uri))
  try {
    const row = await copy.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    const version = row?.user_version ?? 0
    if (version > SCHEMA_VERSION) throw new Error(t('sync.newerApp'))
    if (version < SCHEMA_VERSION) await migrate(copy)
  } finally {
    await copy.closeAsync()
  }

  let hadFiles = false
  await withAttached(db, incoming, 'remote', async () => {
    hadFiles = await copyImagesIn(backend, await referencedImages(db, 'remote'))
    await replaceRows(db, manifest, async (table) => {
      const columns = await db.getAllAsync<{ name: string }>(`PRAGMA main.table_info(${table})`)
      const list = columns.map((c) => `"${c.name}"`).join(', ')
      await db.execAsync(`INSERT INTO main.${table} (${list}) SELECT ${list} FROM remote.${table}`)
      if (ORDERED_TABLES.includes(table)) {
        await db.execAsync(`UPDATE main.${table} SET sort_order = (SELECT r.sort_order FROM remote.${table} r WHERE r.id = ${table}.id)`)
      }
    })
    await convertLegacyAttachments(db)
  })
  incoming.delete()
  return hadFiles
}

let mockCloudFolder: string | null = 'iCloud Drive (Expo Go)'

export async function simulateSyncProgress(mode: 'push' | 'pull' | 'auto' = 'push'): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  if (mode === 'pull') {
    setSyncProgress({ active: true, stage: 'downloading_media', current: 1, total: 3 })
    await sleep(600)
    setSyncProgress({ active: true, stage: 'downloading_media', current: 2, total: 3 })
    await sleep(600)
    setSyncProgress({ active: true, stage: 'downloading_media', current: 3, total: 3 })
    await sleep(600)
  } else {
    setSyncProgress({ active: true, stage: 'uploading_media', current: 1, total: 3 })
    await sleep(600)
    setSyncProgress({ active: true, stage: 'uploading_media', current: 2, total: 3 })
    await sleep(600)
    setSyncProgress({ active: true, stage: 'uploading_media', current: 3, total: 3 })
    await sleep(600)
  }
  setSyncProgress({ active: true, stage: 'done' })
  progressTimer = setTimeout(() => {
    setSyncProgress({ active: false, stage: 'idle' })
  }, 1800)
}

async function simulateSync(mode: SyncMode): Promise<SyncOutcome> {
  await simulateSyncProgress(mode === 'pull' ? 'pull' : 'push')
  return mode === 'pull' ? 'pulled' : 'pushed'
}

async function run(mode: SyncMode): Promise<SyncOutcome> {
  const db = await openDatabaseAsync('reverie.db', { useNewConnection: true }, databaseDirectory())
  try {
    await db.execAsync('PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = OFF;')
    if (mode === 'auto' || mode === 'push-only') {
      const auto = await isAutoSyncEnabled(db)
      if (!auto) return 'unchanged'
    }
    if (!cloudFolder && !reverieSmb) {
      return simulateSync(mode)
    }
    const backend = await getBackend(db, mode)
    if (!backend) return 'unchanged'

    const manifestRead = readManifest(backend).then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    )
    const state = await getSyncState(db)
    const read = await manifestRead
    if ('error' in read) throw read.error
    const manifest = read.value
    const changedHere = state.dirty || state.rev === null
    const changedThere = manifest !== null && manifest.rev !== state.rev

    const finish = (outcome: SyncOutcome, hadFiles = false) => {
      if (hadFiles && (outcome === 'pushed' || outcome === 'pulled')) {
        setSyncProgress({ active: true, stage: 'done' })
        progressTimer = setTimeout(() => {
          setSyncProgress({ active: false, stage: 'idle' })
        }, 1800)
      } else {
        setSyncProgress({ active: false, stage: 'idle' })
      }
      return outcome
    }

    if (mode === 'push') {
      if (changedThere) return finish('behind')
      if (manifest && !changedHere) {
        await markChecked(db)
        return finish('unchanged')
      }
      const hadFiles = await push(db, backend)
      return finish('pushed', hadFiles)
    }
    if (mode === 'pull') {
      if (!manifest) return finish('empty')
      if (!changedThere) {
        await markChecked(db)
        return finish('unchanged')
      }
      if (changedHere && !(state.rev === null && (await isEmpty(db)))) return finish('conflict')
      const hadFiles = await pull(db, backend, manifest)
      return finish('pulled', hadFiles)
    }

    if (!changedThere) {
      if (manifest && !changedHere) {
        await markChecked(db)
        return finish('unchanged')
      }
      const hadFiles = await push(db, backend)
      return finish('pushed', hadFiles)
    }

    let side: 'local' | 'cloud' | null = mode === 'local' || mode === 'cloud' ? mode : null
    if (!side && (!changedHere || (state.rev === null && (await isEmpty(db))))) side = 'cloud'
    if (!side) return finish('conflict')
    if (side === 'local') {
      const hadFiles = await push(db, backend)
      return finish('pushed', hadFiles)
    }
    if (mode === 'push-only') return finish('unchanged')
    if (changedHere) await keepCopy(db)
    const hadFiles = await pull(db, backend, manifest)
    return finish('pulled', hadFiles)
  } catch (err) {
    setSyncProgress({ active: false, stage: 'idle' })
    throw err
  } finally {
    await db.closeAsync()
  }
}

let running: Promise<SyncOutcome> | null = null

export function syncWithCloud(mode: SyncMode = 'auto') {
  running ??= run(mode).finally(() => {
    running = null
  })
  return running
}

export function pickCloudFolder() {
  if (!cloudFolder) {
    mockCloudFolder = 'iCloud Drive (Expo Go)'
    return Promise.resolve(mockCloudFolder)
  }
  return cloudFolder.pickFolder()
}

export function cloudFolderName() {
  return cloudFolder?.folderName() ?? (cloudFolder ? null : mockCloudFolder)
}

export function forgetCloudFolder() {
  if (cloudFolder) cloudFolder.forgetFolder()
  mockCloudFolder = null
}
