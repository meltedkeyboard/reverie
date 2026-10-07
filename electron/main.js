const { app, BrowserWindow, dialog, ipcMain, protocol, net, screen, shell } = require('electron')
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
    const file = path.join(DIST, pathname === '/' ? 'index.html' : decodeURIComponent(pathname))
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

// The height of the title bar the page draws, kept the same as TITLE_BAR_HEIGHT there.
const TITLE_BAR_HEIGHT = 36
// The system buttons stop a point short, above the bar's bottom line, which they would cover.
const OVERLAY_HEIGHT = TITLE_BAR_HEIGHT - 1

// The page is laid out for a screen of about 1600 points across; on a larger one the whole
// page grows with it, up to half again, as with Ctrl+= in an editor, so it doesn't sit small
// in the middle of a big window. Taken again when the window moves to another screen.
const BASE_SCREEN = 1600
// The page's wide layout (the sidebar) needs this much, as WIDE_BREAKPOINT and
// WIDE_MIN_HEIGHT in useLayoutMode.ts: a smaller window is zoomed less, never below 1,
// so it doesn't drop to the phone's layout.
const WIDE = { width: 900, height: 600 }

function zoomFor(win) {
  const { width } = screen.getDisplayMatching(win.getBounds()).workAreaSize
  const [inner, innerHeight] = win.getContentSize()
  const fit = Math.min(inner / WIDE.width, innerHeight / WIDE.height)
  const zoom = Math.floor(Math.min(width / BASE_SCREEN, fit) * 20) / 20
  return Math.min(1.5, Math.max(1, zoom))
}

// The colors of the title bar, which the page sends; kept to size the system buttons anew
// after a change of zoom.
const barColors = new WeakMap()

// The system buttons don't follow the page's zoom, so they are sized to the zoomed bar.
function fitButtons(win) {
  const height = Math.round(TITLE_BAR_HEIGHT * win.webContents.getZoomFactor())
  if (process.platform === 'darwin') {
    // The traffic lights are 16 high; they stay in the middle of the bar.
    win.setWindowButtonPosition({ x: 14, y: Math.round((height - 16) / 2) })
    return
  }
  const colors = barColors.get(win)
  if (colors) win.setTitleBarOverlay({ ...colors, height: height - 1 })
}

function applyZoom(win) {
  const zoom = zoomFor(win)
  if (zoom === win.webContents.getZoomFactor()) return
  win.webContents.setZoomFactor(zoom)
  fitButtons(win)
  win.webContents.send('window:zoom', zoom)
}

ipcMain.on('window:zoom', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  event.returnValue = win ? zoomFor(win) : 1
})

ipcMain.on('window:titleBar', (event, { color, symbolColor }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  barColors.set(win, { color, symbolColor })
  fitButtons(win)
  if (process.platform !== 'darwin') win.setBackgroundColor(color)
})

// Wheel and touchpad scrolling eases instead of stepping, on every platform.
app.commandLine.appendSwitch('enable-features', 'SmoothScrolling')

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#1E1E1E',
    // No system frame: the page draws a title bar of its own, and the system's own
    // buttons sit over it (the traffic lights on a Mac, the overlay elsewhere).
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 12 } }
      : { titleBarOverlay: { color: '#262626', symbolColor: '#B3B3B3', height: OVERLAY_HEIGHT } }),
    icon: path.join(__dirname, '..', 'assets', 'images', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  win.setMenuBarVisibility(false)
  // Set on every load: Chromium keeps a zoom per page and may bring back an old one.
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(zoomFor(win))
    fitButtons(win)
  })
  win.on('moved', () => applyZoom(win))
  win.on('resize', () => applyZoom(win))
  // An app, not a page: no pinch or Ctrl+wheel zoom of the whole window.
  win.webContents.setVisualZoomLevelLimits(1, 1)
  win.webContents.on('before-input-event', (event, input) => {
    const zoomKey = (input.control || input.meta) && ['+', '-', '=', '0'].includes(input.key)
    if (input.type === 'keyDown' && zoomKey) event.preventDefault()
    // Ctrl+W closes a tab of the page, not the window, as in an editor.
    const closeKey = (input.control || input.meta) && !input.shift && !input.alt && input.code === 'KeyW'
    if (input.type === 'keyDown' && closeKey) {
      event.preventDefault()
      win.webContents.send('tabs:close')
    }
  })
  // Links to the outside go to the real browser, not into the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  // The root, not /index.html: expo-router reads the address as the route, and has none called that.
  win.loadURL(DEV_URL ?? 'app://reverie/')
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
