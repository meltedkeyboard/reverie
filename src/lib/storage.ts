import { Directory, File, Paths } from 'expo-file-system'

// Everything Reverie keeps on disk (the database and the avatars) lives in one of two
// places: the Documents folder, which the Files app shows, or a private folder next to it
// that Files can't see. The private one is the default. iOS hides the app's folder in
// Files once Documents is empty, so moving the data out is enough to make it vanish.
const DATA_ITEMS = ['SQLite', 'avatars', 'backgrounds']

// Expo Go only lets an app touch its own sandbox folder, so there the private place falls
// back to a dot-folder inside Documents, which Files doesn't list either.
function pickHiddenRoot() {
  try {
    const dir = new Directory(Paths.document.parentDirectory, 'Library', 'Application Support', 'Reverie')
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

function readShowInFiles() {
  return marker.exists
}

function relocate(from: Directory, to: Directory) {
  to.create({ intermediates: true, idempotent: true })
  for (const name of DATA_ITEMS) {
    const source = new Directory(from, name)
    if (!source.exists) continue
    const target = new Directory(to, name)
    if (target.exists) target.delete()
    source.move(target)
  }
}

// Runs once, on import, before the database opens: the marker is the wish, the folders
// are the current state, and a change of the toggle only takes effect on the next launch
// because the database can't be moved while it is open.
const showInFiles = readShowInFiles()
try {
  if (showInFiles) relocate(hiddenRoot, Paths.document)
  else relocate(Paths.document, hiddenRoot)
} catch {
  // Leave the data where it is rather than stop the app from starting.
}

const dataRoot = showInFiles ? Paths.document : hiddenRoot

export const dataDirectory = dataRoot

// expo-sqlite wants a plain path, without the scheme or a trailing slash.
export const databaseDirectory = decodeURIComponent(new Directory(dataRoot, 'SQLite').uri.replace(/^file:\/\//, '').replace(/\/$/, ''))

export function isShownInFiles() {
  return readShowInFiles()
}

export function setShownInFiles(shown: boolean) {
  if (shown) {
    if (!marker.exists) marker.create()
  } else if (marker.exists) {
    marker.delete()
  }
}

// Whether the files sit where the toggle says. False until the app is restarted.
export function isStoragePending() {
  return readShowInFiles() !== showInFiles
}
