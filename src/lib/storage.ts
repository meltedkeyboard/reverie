import { Directory, File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import type { SQLiteDatabase } from 'expo-sqlite'

// Everything Reverie keeps on disk (the database and the images) lives in one of two
// places: the Documents folder, which the Files app shows, or a private folder next to it
// that Files can't see. The private one is the default. iOS hides the app's folder in
// Files once Documents is empty, so moving the data out is enough to make it vanish.
const DATABASE_FOLDER = 'SQLite'
const DATABASE_NAME = 'reverie.db'
const IMAGE_FOLDERS = ['avatars', 'backgrounds', 'attachments']

const library = new Directory(Paths.document.parentDirectory, 'Library')

// The private folder must not have a space in its path: expo-sqlite parses the directory
// with URL(string:), which on iOS 17+ turns a space into %20, and then opens a brand new
// empty database in a folder literally called "Application%20Support".
//
// Expo Go only lets an app touch its own sandbox folder, so there the private place falls
// back to a dot-folder inside Documents, which Files doesn't list either.
function pickHiddenRoot() {
  // Android keeps the app's files private anyway, and has no Library folder.
  if (Platform.OS === 'android') {
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

const hiddenRoot = pickHiddenRoot()
const marker = new File(hiddenRoot, 'show-in-files')

// Where versions 2.2 to 3.0 kept things. The images and the marker went to the first one,
// the database (because of the %20 bug above) to the second.
const legacySupport = new Directory(library, 'Application Support', 'Reverie')
const legacyMangled = new Directory(library, 'Application%20Support', 'Reverie')

// In Expo Go the Library folder is out of reach and even asking about it can throw.
function existsSafely(dir: Directory) {
  try {
    return dir.exists
  } catch {
    return false
  }
}

function rootFor(shown: boolean) {
  return shown ? Paths.document : hiddenRoot
}

function plainPath(dir: Directory) {
  // expo-sqlite wants a plain path, without the scheme or a trailing slash.
  return decodeURIComponent(dir.uri.replace(/^file:\/\//, '').replace(/\/$/, ''))
}

function databaseFolder(root: Directory) {
  return new Directory(root, DATABASE_FOLDER)
}

function hasDatabase(root: Directory) {
  return new File(databaseFolder(root), DATABASE_NAME).exists
}

// Image names are unique, so two folders are merged file by file rather than one replacing
// the other. A name already at the target is left alone.
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

// A database that lost to a newer one is kept, not deleted: it may be the only copy of
// chats from before an update.
function setAside(root: Directory) {
  const shelf = new Directory(hiddenRoot, 'earlier-databases')
  shelf.create({ intermediates: true, idempotent: true })
  databaseFolder(root).move(new Directory(shelf, `${Date.now()}-${shelf.list().length}`))
}

function removeIfEmpty(dir: Directory) {
  if (dir.exists && dir.list().length === 0) dir.delete()
}

// Runs once, on import, before the database opens. The marker is the wish; this puts the
// files where it says and picks up whatever older versions left behind.
//
// When several databases turn up, the one to keep is the one the app was last showing:
// the one already in place, else the one 2.2 to 3.0 used with the folder hidden, else the
// one at the other place (Documents is where versions before 2.2 kept it).
function settle() {
  const legacyRoots = [legacySupport, legacyMangled].filter(existsSafely)

  const legacyMarker = new File(legacySupport, 'show-in-files')
  if (legacyRoots.includes(legacySupport) && legacyMarker.exists) {
    if (!marker.exists) marker.create()
    legacyMarker.delete()
  }

  const active = rootFor(marker.exists)
  const others = [rootFor(!marker.exists), ...legacyRoots]

  for (const root of others) moveImages(root, active)

  const candidates = [active, legacyMangled, rootFor(!marker.exists), legacySupport].filter(
    (root) => existsSafely(root) && hasDatabase(root)
  )
  const keep = candidates[0]
  if (keep) {
    for (const root of candidates) if (root !== keep) setAside(root)
    if (keep !== active) {
      // An empty folder at the target would make move() nest the database inside it.
      const target = databaseFolder(active)
      if (target.exists) target.delete()
      databaseFolder(keep).move(target)
    }
  }

  for (const root of legacyRoots) {
    const folder = databaseFolder(root)
    if (folder.exists && !hasDatabase(root)) folder.delete()
    removeIfEmpty(root)
  }
  if (legacyRoots.includes(legacyMangled)) removeIfEmpty(legacyMangled.parentDirectory)
}

try {
  settle()
} catch (err) {
  // Leave the data where it is rather than stop the app from starting.
  console.warn('Could not settle the data folders', err)
}

let shown = marker.exists

export function dataDirectory() {
  return rootFor(shown)
}

export function databaseDirectory(): string | undefined {
  return plainPath(databaseFolder(rootFor(shown)))
}

export function isShownInFiles() {
  return shown
}

// Moves everything to the other place while the app keeps running. The open database
// can't be moved, so it is copied with VACUUM INTO, which gives a consistent snapshot
// even mid-use; the caller then opens the copy and, once the old one is closed, calls
// discardInactiveDatabase. The marker flips last, so a crash halfway leaves two copies
// that settle() sorts out on the next launch.
//
// Returns what puts everything back, for when the copy then fails to open.
export async function moveStorage(db: SQLiteDatabase, nextShown: boolean) {
  if (nextShown === shown) return () => {}
  const previous = shown
  const from = rootFor(shown)
  const to = rootFor(nextShown)

  const target = databaseFolder(to)
  if (target.exists) target.delete()
  target.create({ intermediates: true, idempotent: true })
  const path = `${plainPath(target)}/${DATABASE_NAME}`
  try {
    await db.execAsync(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
  } catch (err) {
    if (target.exists) target.delete()
    throw err
  }

  // Runs after something already failed, so a failure here is only logged: whatever it
  // leaves behind, settle() gathers up on the next launch.
  const undo = () => {
    shown = previous
    try {
      writeMarker(previous)
      moveImages(to, from)
      if (target.exists) target.delete()
    } catch (err) {
      console.warn('Could not put the files back', err)
    }
  }

  try {
    moveImages(from, to)
    writeMarker(nextShown)
  } catch (err) {
    // Half the images moved would show as broken until the next launch.
    undo()
    throw err
  }
  shown = nextShown
  return undo
}

function writeMarker(value: boolean) {
  if (value) {
    if (!marker.exists) marker.create()
  } else if (marker.exists) {
    marker.delete()
  }
}

// A copy of the database put aside next to the ones settle() keeps, for when the data here
// is about to be replaced with the copy from the sync folder.
export async function keepCopy(db: SQLiteDatabase) {
  const shelf = new Directory(hiddenRoot, 'earlier-databases', `${Date.now()}-before-sync`)
  shelf.create({ intermediates: true, idempotent: true })
  // On the web the database is not a file SQLite can write to, so its bytes are saved.
  if (Platform.OS === 'web') {
    new File(shelf, DATABASE_NAME).write(await db.serializeAsync('main'))
    return
  }
  const path = `${plainPath(shelf)}/${DATABASE_NAME}`
  await db.execAsync(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
}

export function discardInactiveDatabase() {
  const stale = databaseFolder(rootFor(!shown))
  if (stale.exists && hasDatabase(rootFor(shown))) stale.delete()
}
