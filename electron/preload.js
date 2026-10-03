const { contextBridge, ipcRenderer } = require('electron')

// The bridge to Node: the sync folder. Paths are relative to the folder the user picked;
// the main process keeps them inside it.
contextBridge.exposeInMainWorld('reverieDesktop', {
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
