import { Directory, File, Paths } from 'expo-file-system'
import type { SQLiteDatabase } from 'expo-sqlite'
import { isAndroid, isWeb } from '@/lib/core/platform'

// All data (the single database and the images) lives in one fixed, private place:
// Library/Reverie on iOS, and Reverie under Documents on Android.
const DATABASE_FOLDER = 'SQLite'
const DATABASE_NAME = 'reverie.db'
const IMAGE_FOLDERS = ['avatars', 'backgrounds', 'attachments', 'gallery']

const library = new Directory(Paths.document.parentDirectory, 'Library')

function pickStorageRoot() {
  if (isAndroid) {
    const dir = new Directory(Paths.document, 'Reverie')
    dir.create({ intermediates: true, idempotent: true })
    return dir
  }
  try {
    const dir = new Directory(library, 'Reverie')
    dir.create({ intermediates: true, idempotent: true })
    return dir
  } catch {
    const dir = new Directory(Paths.document, '.reverie')
    dir.create({ intermediates: true, idempotent: true })
    return dir
  }
}

const storageRoot = pickStorageRoot()

const legacySupport = new Directory(library, 'Application Support', 'Reverie')
const legacyMangled = new Directory(library, 'Application%20Support', 'Reverie')

function existsSafely(dir: Directory) {
  try {
    return dir.exists
  } catch {
    return false
  }
}

function plainPath(dir: Directory) {
  return decodeURIComponent(dir.uri.replace(/^file:\/\//, '').replace(/\/$/, ''))
}

function databaseFolder(root: Directory) {
  return new Directory(root, DATABASE_FOLDER)
}

function mergeFolder(from: Directory, to: Directory) {
  if (!from.exists) return
  to.create({ intermediates: true, idempotent: true })
  for (const item of from.list()) {
    if (item instanceof Directory) {
      mergeFolder(item, new Directory(to, item.name))
    } else if (!new File(to, item.name).exists) {
      item.move(to)
    }
  }
  if (from.list().length === 0) from.delete()
}

function moveImages(from: Directory, to: Directory) {
  for (const name of IMAGE_FOLDERS) mergeFolder(new Directory(from, name), new Directory(to, name))
}

function removeIfEmpty(dir: Directory) {
  if (dir.exists && dir.list().length === 0) dir.delete()
}

function fileMtime(file: File): number {
  try {
    return file.modificationTime ?? 0
  } catch {
    return 0
  }
}

function dbMtime(dbFile: File): number {
  const dir = dbFile.parentDirectory
  const wal = new File(dir, `${dbFile.name}-wal`)
  const mainTime = fileMtime(dbFile)
  const walTime = wal.exists ? fileMtime(wal) : 0
  return Math.max(mainTime, walTime)
}

type Candidate = {
  folder: Directory
  dbFile: File
  mtime: number
}

// Runs once on import before the database opens. Consolidates all databases and image folders
// into the single canonical storage root, automatically picking the newest available database,
// and removes any duplicate or earlier-database shelves.
function settle() {
  const targetFolder = databaseFolder(storageRoot)
  const canonicalDb = new File(targetFolder, DATABASE_NAME)
  const candidates: Candidate[] = []

  if (canonicalDb.exists) {
    candidates.push({ folder: targetFolder, dbFile: canonicalDb, mtime: dbMtime(canonicalDb) })
  }

  // Scan earlier-databases archives for any newer databases to recover
  const shelves = [
    new Directory(storageRoot, 'earlier-databases'),
    new Directory(Paths.document, 'earlier-databases'),
    new Directory(Paths.document, '.reverie', 'earlier-databases'),
  ]

  for (const shelf of shelves) {
    if (!existsSafely(shelf)) continue
    for (const item of shelf.list()) {
      if (item instanceof Directory) {
        const direct = new File(item, DATABASE_NAME)
        const nested = new File(databaseFolder(item), DATABASE_NAME)
        if (direct.exists) candidates.push({ folder: item, dbFile: direct, mtime: dbMtime(direct) })
        if (nested.exists) candidates.push({ folder: databaseFolder(item), dbFile: nested, mtime: dbMtime(nested) })
      }
    }
  }

  // Scan alternate roots and merge their images
  const otherRoots = [legacySupport, legacyMangled, Paths.document, new Directory(Paths.document, '.reverie')]
  for (const root of otherRoots) {
    if (!existsSafely(root) || root.uri === storageRoot.uri) continue
    const db = new File(databaseFolder(root), DATABASE_NAME)
    if (db.exists) candidates.push({ folder: databaseFolder(root), dbFile: db, mtime: dbMtime(db) })
    moveImages(root, storageRoot)
  }

  // Pick the candidate with the newest modification time
  candidates.sort((a, b) => b.mtime - a.mtime)
  const winner = candidates[0]

  if (winner && winner.folder.uri !== targetFolder.uri) {
    targetFolder.create({ intermediates: true, idempotent: true })
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const src = new File(winner.folder, `${DATABASE_NAME}${suffix}`)
      const dst = new File(targetFolder, `${DATABASE_NAME}${suffix}`)
      if (dst.exists) dst.delete()
      if (src.exists) src.copy(targetFolder)
    }
  }

  // Clean up legacy files and archives
  for (const shelf of shelves) {
    if (existsSafely(shelf)) {
      try {
        shelf.delete()
      } catch {}
    }
  }

  const marker = new File(storageRoot, 'show-in-files')
  if (marker.exists) {
    try {
      marker.delete()
    } catch {}
  }

  for (const root of [legacySupport, legacyMangled]) {
    if (!existsSafely(root)) continue
    const folder = databaseFolder(root)
    if (folder.exists) folder.delete()
    removeIfEmpty(root)
  }
  if (existsSafely(legacyMangled)) removeIfEmpty(legacyMangled.parentDirectory)

  // Clean up stale database folder in Documents if not storageRoot
  if (Paths.document.uri !== storageRoot.uri) {
    const docsDbFolder = databaseFolder(Paths.document)
    if (existsSafely(docsDbFolder)) {
      try {
        docsDbFolder.delete()
      } catch {}
    }
  }
}

try {
  settle()
} catch (err) {
  console.warn('Could not settle storage', err)
}

export function dataDirectory() {
  return storageRoot
}

export function databaseDirectory(): string | undefined {
  return plainPath(databaseFolder(storageRoot))
}

// A safety snapshot before folder sync replaces rows
export async function keepCopy(db: SQLiteDatabase) {
  const backups = new Directory(storageRoot, 'backups')
  backups.create({ intermediates: true, idempotent: true })
  if (isWeb) {
    new File(backups, DATABASE_NAME).writeSync(await db.serializeAsync('main'))
    return
  }
  const path = `${plainPath(backups)}/before-sync-${DATABASE_NAME}`
  await db.execAsync(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
}
