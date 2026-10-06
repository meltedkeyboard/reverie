const { contextBridge, ipcRenderer } = require('electron')

// The bridge to Node: the sync folder. Paths are relative to the folder the user picked;
// the main process keeps them inside it.
contextBridge.exposeInMainWorld('reverieDesktop', {
  platform: process.platform,
  // The window has no frame of its own: the page draws the title bar, and on Windows and
  // Linux the system buttons are painted over its right end in these colors.
  setTitleBar: (colors) => ipcRenderer.send('window:titleBar', colors),
  // Ctrl+W, caught by the main process before the window's menu closes the window.
  onCloseTab: (listener) => {
    const handler = () => listener()
    ipcRenderer.on('tabs:close', handler)
    return () => ipcRenderer.removeListener('tabs:close', handler)
  },
  cloudFolder: {
    pick: () => ipcRenderer.invoke('cloud:pick'),
    name: () => ipcRenderer.sendSync('cloud:folderName'),
    forget: () => ipcRenderer.send('cloud:forget'),
    list: (path) => ipcRenderer.invoke('cloud:list', path),
    read: (path) => ipcRenderer.invoke('cloud:read', path),
    write: (path, bytes) => ipcRenderer.invoke('cloud:write', path, bytes),
    remove: (path) => ipcRenderer.invoke('cloud:remove', path),
  },
})
