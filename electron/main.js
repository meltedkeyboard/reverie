const { app, BrowserWindow, dialog, ipcMain, protocol, net, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const DEV_URL = process.env.REVERIE_DEV_URL
const DIST = path.join(__dirname, '..', 'dist')

// The web build needs a secure origin with cross-origin isolation (the SQLite worker uses
// SharedArrayBuffer and OPFS), which file:// can't give, so the build is served from app://.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

function serveDist() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url)
    let file = path.join(DIST, decodeURIComponent(pathname))
    // Stay inside dist, and let expo-router's client routes fall back to the page.
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 })
    const response = await net.fetch(pathToFileURL(file).toString()).catch(() => null)
    const found = response && response.ok ? response : await net.fetch(pathToFileURL(path.join(DIST, 'index.html')).toString())
    const headers = new Headers(found.headers)
    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
    return new Response(found.body, { status: found.status, headers })
  })
}

// The sync folder: the one the user picked is remembered in a file of the app's data, and
// every path the page asks for is a relative one, kept inside it.
const SYNC_FILE = () => path.join(app.getPath('userData'), 'sync-folder.json')

function syncRoot() {
  try {
    const { folder } = JSON.parse(fs.readFileSync(SYNC_FILE(), 'utf8'))
    return typeof folder === 'string' && fs.statSync(folder).isDirectory() ? folder : null
  } catch {
    return null
  }
}

function inside(relative) {
  const root = syncRoot()
  if (!root) throw new Error('No sync folder')
  const full = path.resolve(root, relative)
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Path outside the sync folder')
  return full
}

ipcMain.on('cloud:folderName', (event) => {
  const root = syncRoot()
  event.returnValue = root ? path.basename(root) || root : null
})

ipcMain.handle('cloud:pick', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  fs.writeFileSync(SYNC_FILE(), JSON.stringify({ folder: result.filePaths[0] }))
  return path.basename(result.filePaths[0]) || result.filePaths[0]
})

ipcMain.on('cloud:forget', () => fs.rmSync(SYNC_FILE(), { force: true }))

ipcMain.handle('cloud:list', (event, relative) => {
  const dir = inside(relative)
  return fs.existsSync(dir) ? fs.readdirSync(dir) : []
})

ipcMain.handle('cloud:read', (event, relative) => fs.readFileSync(inside(relative)))

ipcMain.handle('cloud:write', (event, relative, bytes) => {
  const file = inside(relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Written beside and renamed over, so a reader never meets half a file.
  const temp = `${file}.part`
  fs.writeFileSync(temp, Buffer.from(bytes))
  fs.renameSync(temp, file)
})

ipcMain.handle('cloud:remove', (event, relative) => fs.rmSync(inside(relative), { force: true }))

// Wheel and touchpad scrolling eases instead of stepping, on every platform.
app.commandLine.appendSwitch('enable-features', 'SmoothScrolling')

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#0F0F12',
    icon: path.join(__dirname, '..', 'assets', 'images', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  win.setMenuBarVisibility(false)
  // Links to the outside go to the real browser, not into the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.loadURL(DEV_URL ?? 'app://reverie/index.html')
}

app.whenReady().then(() => {
  if (!DEV_URL) serveDist()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
