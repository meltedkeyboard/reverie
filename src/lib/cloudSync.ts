import { Directory, File, Paths } from 'expo-file-system'
import { deserializeDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'

import { getSyncState, markChecked, markSynced, setDirty } from '@/db/cloudSync'
import { migrate, SCHEMA_VERSION } from '@/db/schema'
import { t } from '@/i18n'
import { convertLegacyAttachments } from '@/db/attachments'
import { avatarUri, type ImageKind } from '@/lib/avatarStore'
import { dataDirectory, databaseDirectory, keepCopy } from '@/lib/storage'
import { isWeb } from '@/lib/platform'
import { cloudFolder } from '../../modules/reverie-cloud-folder'

// Sync with a folder the user picked (iCloud Drive, Google Drive, a local one), as whole
// snapshots. The folder holds:
//
//   manifest.json          which revision is there; written last, so it is the commit point
//   reverie.db             the database without app_settings (API key, this device's flags)
//   avatars/, backgrounds/ the pictures the database points at, by their unique names
//
// A device remembers the revision it last pushed or pulled and whether anything changed
// since (sync_dirty, set by triggers). Only one side changed: that side wins. Both did:
// the user picks one, and the data here is put aside first if it is the one that loses.
// The database in the folder is never opened in place: SQLite over a synced file corrupts.

export const cloudSyncAvailable = cloudFolder !== null

// 'behind': a push was refused because the folder has a revision this device has not seen;
// 'empty': a pull found nothing in the folder.
export type SyncOutcome = 'pushed' | 'pulled' | 'unchanged' | 'conflict' | 'behind' | 'empty'

// 'push' and 'pull' are the buttons: one way only, and they stop where they would throw
// away changes. 'local' and 'cloud' go ahead anyway, and settle a conflict; 'push-only' is
// for going to the background, where there is no time to replace the data under the screens.
export type SyncMode = 'auto' | 'push-only' | 'push' | 'pull' | 'local' | 'cloud'

type Manifest = { app: 'reverie'; rev: string; schema: number; savedAt: number }

const MANIFEST = 'manifest.json'
const DATABASE = 'reverie.db'
const IMAGE_KINDS: ImageKind[] = ['avatars', 'backgrounds', 'attachments']
// Parents first, so rows can be put back in this order and deleted in the reverse one.
const TABLES = ['characters', 'rooms', 'room_members', 'chats', 'messages']
// Tables whose insert trigger puts each new row on top and so scrambles a copied order.
const ORDERED_TABLES = ['characters', 'rooms', 'chats']

function folder() {
  if (!cloudFolder) throw new Error(t('sync.unavailable'))
  return cloudFolder
}

function workFile(name: string) {
  const dir = new Directory(Paths.cache, 'folder-sync')
  dir.create({ intermediates: true, idempotent: true })
  return new File(dir, name)
}

// SQLite wants a plain path, without the scheme or a trailing slash.
function plainPath(uri: string) {
  return decodeURIComponent(uri.replace(/^file:\/\//, '').replace(/\/$/, ''))
}

function sqlPath(file: File) {
  return `'${plainPath(file.uri).replace(/'/g, "''")}'`
}

// A database left over from an interrupted run must not meet its old journal.
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
     UNION SELECT background, 'backgrounds' FROM ${schema}.rooms WHERE background IS NOT NULL
     UNION SELECT background_original, 'backgrounds' FROM ${schema}.rooms WHERE background_original IS NOT NULL
     UNION SELECT json_extract(j.value, '$.file'), 'attachments'
       FROM ${schema}.messages m, json_each(m.images) j WHERE m.images IS NOT NULL AND json_valid(m.images)
     UNION SELECT json_extract(j.value, '$.moving'), 'attachments'
       FROM ${schema}.messages m, json_each(m.images) j WHERE m.images IS NOT NULL AND json_valid(m.images)`
  )
  const images: Record<ImageKind, Set<string>> = { avatars: new Set(), backgrounds: new Set(), attachments: new Set() }
  // A message of an older database has base64 in its row and no file yet.
  for (const row of rows) if (row.name) images[row.kind].add(row.name)
  return images
}

async function readManifest(): Promise<Manifest | null> {
  const names = await folder().list('')
  if (!names.includes(MANIFEST)) return null
  const file = workFile(MANIFEST)
  await folder().copyIn(MANIFEST, file.uri)
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

// The isWeb has no files SQLite can write or attach (the database sits in the browser's own
// storage), so there the snapshot is made in memory, and the rows come over one by one.

async function makeSnapshot(db: SQLiteDatabase, snapshot: File) {
  if (isWeb) {
    const copy = await deserializeDatabaseAsync(await db.serializeAsync('main'))
    try {
      await copy.execAsync('DELETE FROM app_settings')
      const images = await referencedImages(copy, 'main')
      snapshot.write(await copy.serializeAsync('main'))
      return images
    } finally {
      await copy.closeAsync()
    }
  }
  await db.execAsync(`VACUUM INTO ${sqlPath(snapshot)}`)
  return withAttached(db, snapshot, 'snap', async () => {
    // secure_delete zeroes the rows, so the API key is not left in free pages of the file.
    await db.execAsync('PRAGMA snap.secure_delete = ON; DELETE FROM snap.app_settings;')
    return referencedImages(db, 'snap')
  })
}

async function push(db: SQLiteDatabase) {
  // Cleared before the snapshot is taken, so a change made while the upload runs sets it
  // again and goes up next time instead of being lost.
  await setDirty(db, false)
  try {
    const snapshot = freshFile('outgoing.db')
    const images = await makeSnapshot(db, snapshot)

    const stale: string[] = []
    for (const kind of IMAGE_KINDS) {
      const there = new Set(await folder().list(kind))
      for (const name of images[kind]) {
        if (there.has(name)) continue
        const local = new File(avatarUri(name, kind)!)
        if (local.exists) await folder().copyOut(local.uri, `${kind}/${name}`)
      }
      for (const name of there) if (!images[kind].has(name)) stale.push(`${kind}/${name}`)
    }

    await folder().copyOut(snapshot.uri, DATABASE)
    const manifest: Manifest = { app: 'reverie', rev: newRev(), schema: SCHEMA_VERSION, savedAt: Date.now() }
    const manifestFile = workFile(MANIFEST)
    manifestFile.create({ overwrite: true })
    manifestFile.write(JSON.stringify(manifest))
    await folder().copyOut(manifestFile.uri, MANIFEST)
    await markSynced(db, manifest.rev)
    snapshot.delete()

    // Only once the new manifest is up: a device still reading the old one may need them.
    for (const path of stale) await folder().remove(path).catch(() => {})
  } catch (err) {
    await setDirty(db, true)
    throw err
  }
}

async function copyImagesIn(images: Record<ImageKind, Set<string>>) {
  for (const kind of IMAGE_KINDS) {
    const dir = new Directory(dataDirectory(), kind)
    dir.create({ intermediates: true, idempotent: true })
    for (const name of images[kind]) {
      if (new File(avatarUri(name, kind)!).exists) continue
      await folder().copyIn(`${kind}/${name}`, new File(dir, name).uri)
    }
  }
}

// Written straight into the open database rather than swapping the file, so the screens
// keep a working connection; the caller then hands them a fresh one.
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

async function pullInMemory(db: SQLiteDatabase, manifest: Manifest, incoming: File) {
  const copy = await deserializeDatabaseAsync(await incoming.bytes())
  try {
    const row = await copy.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    const version = row?.user_version ?? 0
    if (version > SCHEMA_VERSION) throw new Error(t('sync.newerApp'))
    if (version < SCHEMA_VERSION) await migrate(copy)

    await copyImagesIn(await referencedImages(copy, 'main'))
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
  } finally {
    await copy.closeAsync()
  }
}

async function pull(db: SQLiteDatabase, manifest: Manifest) {
  const incoming = freshFile('incoming.db')
  await folder().copyIn(DATABASE, incoming.uri)
  if (isWeb) {
    await pullInMemory(db, manifest, incoming)
    incoming.delete()
    return
  }

  // A copy from an older version of the app is brought up to this one first.
  const copy = await openDatabaseAsync(incoming.name, { useNewConnection: true }, plainPath(incoming.parentDirectory.uri))
  try {
    const row = await copy.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    const version = row?.user_version ?? 0
    if (version > SCHEMA_VERSION) throw new Error(t('sync.newerApp'))
    if (version < SCHEMA_VERSION) await migrate(copy)
  } finally {
    await copy.closeAsync()
  }

  await withAttached(db, incoming, 'remote', async () => {
    await copyImagesIn(await referencedImages(db, 'remote'))
    await replaceRows(db, manifest, async (table) => {
      const columns = await db.getAllAsync<{ name: string }>(`PRAGMA main.table_info(${table})`)
      const list = columns.map((c) => `"${c.name}"`).join(', ')
      await db.execAsync(`INSERT INTO main.${table} (${list}) SELECT ${list} FROM remote.${table}`)
      if (ORDERED_TABLES.includes(table)) {
        await db.execAsync(`UPDATE main.${table} SET sort_order = (SELECT r.sort_order FROM remote.${table} r WHERE r.id = ${table}.id)`)
      }
    })
    // Rows from a database older than the files for pictures still carry them in base64.
    await convertLegacyAttachments(db)
  })
  incoming.delete()
}

async function run(mode: SyncMode): Promise<SyncOutcome> {
  // A connection of its own: ATTACH fails inside a transaction, and the app's connection
  // may be in one at any moment.
  const db = await openDatabaseAsync('reverie.db', { useNewConnection: true }, databaseDirectory())
  try {
    await db.execAsync('PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = OFF;')
    const [manifest, state] = await Promise.all([readManifest(), getSyncState(db)])
    // Data from before sync was turned on counts as changed: it has never been anywhere.
    const changedHere = state.dirty || state.rev === null
    const changedThere = manifest !== null && manifest.rev !== state.rev

    if (mode === 'push') {
      if (changedThere) return 'behind'
      if (manifest && !changedHere) {
        await markChecked(db)
        return 'unchanged'
      }
      await push(db)
      return 'pushed'
    }
    if (mode === 'pull') {
      if (!manifest) return 'empty'
      if (!changedThere) {
        await markChecked(db)
        return 'unchanged'
      }
      // Nothing here yet on a fresh device: nothing to lose, so no need to ask.
      if (changedHere && !(state.rev === null && (await isEmpty(db)))) return 'conflict'
      await pull(db, manifest)
      return 'pulled'
    }

    if (!changedThere) {
      if (manifest && !changedHere) {
        await markChecked(db)
        return 'unchanged'
      }
      await push(db)
      return 'pushed'
    }

    let side: 'local' | 'cloud' | null = mode === 'local' || mode === 'cloud' ? mode : null
    if (!side && (!changedHere || (state.rev === null && (await isEmpty(db))))) side = 'cloud'
    if (!side) return 'conflict'
    if (side === 'local') {
      await push(db)
      return 'pushed'
    }
    if (mode === 'push-only') return 'unchanged'
    if (changedHere) await keepCopy(db)
    await pull(db, manifest)
    return 'pulled'
  } finally {
    await db.closeAsync()
  }
}

let running: Promise<SyncOutcome> | null = null

// One sync at a time: a second call while one runs gets the result of the first.
export function syncWithCloud(mode: SyncMode = 'auto') {
  running ??= run(mode).finally(() => {
    running = null
  })
  return running
}

export function pickCloudFolder() {
  return folder().pickFolder()
}

export function cloudFolderName() {
  return cloudFolder?.folderName() ?? null
}

export function forgetCloudFolder() {
  cloudFolder?.forgetFolder()
}
