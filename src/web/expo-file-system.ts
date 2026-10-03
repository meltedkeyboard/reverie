// expo-file-system for the web (desktop build in Tauri, or a browser). The app uses the
// synchronous File / Directory / Paths API, so the tree is kept in memory and mirrored to
// IndexedDB in the background. loadFileSystem() must finish before the app is imported.
//
// A File's uri is a blob: URL, because that is the only thing <img> and <video> can show.
// new File(blobUri) gives the same file back, so it still works as a handle.

type Entry = { bytes: Uint8Array; modified: number }

const ROOT = 'file:///'
const DB_NAME = 'reverie-files'
const STORE = 'files'

const files = new Map<string, Entry>()
const dirs = new Set<string>([ROOT.slice(0, -1)])
const blobs = new Map<string, string>() // path -> blob url
const paths = new Map<string, string>() // blob url -> path

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', json: 'application/json',
  zip: 'application/zip', txt: 'text/plain', db: 'application/vnd.sqlite3',
}

let idb: Promise<IDBDatabase> | null = null

function database() {
  idb ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  return idb
}

async function persist(path: string, entry: Entry | null) {
  try {
    const store = (await database()).transaction(STORE, 'readwrite').objectStore(STORE)
    if (entry) store.put(entry, path)
    else store.delete(path)
  } catch {
    // Private window or blocked storage: the session still works from memory.
  }
}

export async function loadFileSystem() {
  try {
    const store = (await database()).transaction(STORE, 'readonly').objectStore(STORE)
    const keys = await new Promise<IDBValidKey[]>((ok, no) => {
      const r = store.getAllKeys()
      r.onsuccess = () => ok(r.result)
      r.onerror = () => no(r.error)
    })
    const values = await new Promise<Entry[]>((ok, no) => {
      const r = store.getAll()
      r.onsuccess = () => ok(r.result)
      r.onerror = () => no(r.error)
    })
    keys.forEach((key, i) => {
      files.set(String(key), values[i])
      makeDirs(parentOf(String(key)))
    })
  } catch {
    // Nothing stored yet, or storage is unavailable.
  }
}

function clean(path: string) {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}

function parentOf(path: string) {
  return path.slice(0, path.lastIndexOf('/')) || '/'
}

function makeDirs(path: string) {
  for (let p = path; p !== '/' && !dirs.has(p); p = parentOf(p)) dirs.add(p)
  dirs.add('/')
}

function isExternal(uri: string) {
  return /^(blob:|data:|https?:)/.test(uri)
}

type Part = string | { uri: string }

// Joins the arguments of new File(...) / new Directory(...) into a path inside the tree.
function resolvePath(parts: Part[]) {
  const first = parts[0]
  const firstUri = typeof first === 'string' ? first : first.uri
  if (blobs.size && paths.has(firstUri) && parts.length === 1) return paths.get(firstUri)!
  const joined = parts
    .map((part) => (typeof part === 'string' ? part : part instanceof File ? (paths.get(part.uri) ?? part.uri) : part.uri))
    .map((s, i) => (i === 0 ? s.replace(/^file:\/\//, '') : s))
    .join('/')
  return clean(decodeURI(joined))
}

function typeOf(name: string) {
  return MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

function changed(path: string) {
  const url = blobs.get(path)
  if (url) {
    URL.revokeObjectURL(url)
    blobs.delete(path)
    paths.delete(url)
  }
}

function encode(content: string | Uint8Array) {
  return typeof content === 'string' ? new TextEncoder().encode(content) : content
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export class File {
  private path: string
  private external: string | null

  constructor(...parts: Part[]) {
    const first = parts[0]
    const uri = typeof first === 'string' ? first : first.uri
    this.external = isExternal(uri) && !paths.has(uri) ? uri : null
    this.path = this.external ? this.external : resolvePath(parts)
  }

  get uri() {
    if (this.external) return this.external
    const entry = files.get(this.path)
    if (!entry) return ROOT.slice(0, -1) + this.path
    let url = blobs.get(this.path)
    if (!url) {
      url = URL.createObjectURL(new Blob([entry.bytes as BlobPart], { type: typeOf(this.name) ?? '' }))
      blobs.set(this.path, url)
      paths.set(url, this.path)
    }
    return url
  }

  get name() {
    const base = this.external ? this.external.split(/[?#]/)[0] : this.path
    return decodeURIComponent(base.slice(base.lastIndexOf('/') + 1))
  }

  get extension() {
    const dot = this.name.lastIndexOf('.')
    return dot < 0 ? '' : this.name.slice(dot)
  }

  get exists() {
    return this.external !== null || files.has(this.path)
  }

  get size() {
    return files.get(this.path)?.bytes.length ?? 0
  }

  get type() {
    return typeOf(this.name)
  }

  get modificationTime() {
    return files.get(this.path)?.modified ?? null
  }

  get creationTime() {
    return this.modificationTime
  }

  get parentDirectory() {
    return new Directory(ROOT.slice(0, -1) + parentOf(this.path))
  }

  create(options?: { intermediates?: boolean; overwrite?: boolean }) {
    if (files.has(this.path) && !options?.overwrite) throw new Error(`File already exists: ${this.path}`)
    if (!dirs.has(parentOf(this.path)) && !options?.intermediates) throw new Error(`No folder for ${this.path}`)
    this.store(new Uint8Array(0))
  }

  write(content: string | Uint8Array) {
    makeDirs(parentOf(this.path))
    this.store(encode(content))
  }

  private store(bytes: Uint8Array) {
    makeDirs(parentOf(this.path))
    changed(this.path)
    const entry = { bytes, modified: Date.now() }
    files.set(this.path, entry)
    void persist(this.path, entry)
  }

  private read() {
    const entry = files.get(this.path)
    if (!entry) throw new Error(`File does not exist: ${this.path}`)
    return entry.bytes
  }

  async bytes() {
    if (this.external) return new Uint8Array(await (await fetch(this.external)).arrayBuffer())
    return this.read()
  }

  bytesSync() {
    return this.read()
  }

  async text() {
    return new TextDecoder().decode(await this.bytes())
  }

  textSync() {
    return new TextDecoder().decode(this.read())
  }

  async base64() {
    return toBase64(await this.bytes())
  }

  base64Sync() {
    return toBase64(this.read())
  }

  delete() {
    if (!files.has(this.path)) throw new Error(`File does not exist: ${this.path}`)
    changed(this.path)
    files.delete(this.path)
    void persist(this.path, null)
  }

  copy(to: File | Directory): void | Promise<void> {
    const target = to instanceof Directory ? new File(to, this.name) : to
    if (this.external) {
      return this.bytes().then((bytes) => target.write(bytes))
    }
    target.write(this.read().slice())
  }

  move(to: File | Directory) {
    const target = to instanceof Directory ? new File(to, this.name) : to
    target.write(this.read())
    this.delete()
    this.path = target.path
  }

  rename(name: string) {
    this.move(new File(parentOf(this.path), name))
  }

  open() {
    const bytes = this.read()
    let offset = 0
    return {
      get size() { return bytes.length },
      get offset() { return offset },
      set offset(value: number) { offset = value },
      readBytes(length: number) {
        const out = bytes.slice(offset, offset + length)
        offset += out.length
        return out
      },
      writeBytes() {
        throw new Error('Not supported on the web')
      },
      close() {},
    }
  }
}

export class Directory {
  private path: string

  constructor(...parts: Part[]) {
    this.path = resolvePath(parts)
  }

  get uri() {
    return ROOT.slice(0, -1) + (this.path === '/' ? '' : this.path) + '/'
  }

  get name() {
    return decodeURIComponent(this.path.slice(this.path.lastIndexOf('/') + 1))
  }

  get exists() {
    return dirs.has(this.path)
  }

  get size() {
    let total = 0
    for (const [path, entry] of files) if (path.startsWith(this.path + '/')) total += entry.bytes.length
    return total
  }

  get parentDirectory() {
    return new Directory(ROOT.slice(0, -1) + parentOf(this.path))
  }

  create(options?: { intermediates?: boolean; idempotent?: boolean; overwrite?: boolean }) {
    if (dirs.has(this.path) && !options?.idempotent) throw new Error(`Folder already exists: ${this.path}`)
    if (!dirs.has(parentOf(this.path)) && !options?.intermediates) throw new Error(`No folder for ${this.path}`)
    makeDirs(this.path)
  }

  delete() {
    if (!dirs.has(this.path)) throw new Error(`Folder does not exist: ${this.path}`)
    const prefix = this.path + '/'
    for (const path of [...files.keys()]) {
      if (!path.startsWith(prefix)) continue
      changed(path)
      files.delete(path)
      void persist(path, null)
    }
    for (const path of [...dirs]) if (path === this.path || path.startsWith(prefix)) dirs.delete(path)
  }

  list() {
    if (!dirs.has(this.path)) throw new Error(`Folder does not exist: ${this.path}`)
    const prefix = this.path === '/' ? '/' : this.path + '/'
    const out: (File | Directory)[] = []
    for (const path of files.keys()) {
      if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) out.push(new File(ROOT.slice(0, -1) + path))
    }
    for (const path of dirs) {
      if (path !== this.path && path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) {
        out.push(new Directory(ROOT.slice(0, -1) + path))
      }
    }
    return out
  }

  createFile(name: string, _mimeType?: string | null) {
    const file = new File(this, name)
    file.create()
    return file
  }

  createDirectory(name: string) {
    const dir = new Directory(this, name)
    dir.create()
    return dir
  }

  copy(to: Directory) {
    const target = new Directory(to, this.name)
    target.create({ intermediates: true, idempotent: true })
    for (const item of this.list()) item.copy(target)
  }

  move(to: Directory) {
    const target = to.exists && to.path !== this.path ? to : to
    const from = this.path
    const prefix = from + '/'
    target.create({ intermediates: true, idempotent: true })
    for (const path of [...files.keys()].filter((p) => p.startsWith(prefix))) {
      new File(ROOT.slice(0, -1) + path).move(new File(target, path.slice(prefix.length)))
    }
    for (const path of [...dirs].filter((p) => p.startsWith(prefix))) makeDirs(clean(target.path + '/' + path.slice(prefix.length)))
    this.delete()
    this.path = target.path
  }

  static async pickDirectoryAsync(): Promise<Directory> {
    throw new Error('cancelled')
  }
}

export const Paths = {
  document: new Directory(ROOT + 'documents'),
  cache: new Directory(ROOT + 'cache'),
  bundle: new Directory(ROOT + 'bundle'),
  join: (...parts: string[]) => clean(parts.join('/')),
}

Paths.document.create({ intermediates: true, idempotent: true })
Paths.cache.create({ intermediates: true, idempotent: true })
