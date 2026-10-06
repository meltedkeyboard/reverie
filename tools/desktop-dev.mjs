// npm run desktop: starts Metro, waits until it answers, then opens the Electron window on it.
import { spawn } from 'node:child_process'
import net from 'node:net'

const PORT = 8081
const shell = process.platform === 'win32'

function portOpen() {
  return new Promise((resolve) => {
    const socket = net.connect(PORT, '127.0.0.1')
    socket.on('connect', () => (socket.destroy(), resolve(true)))
    socket.on('error', () => resolve(false))
  })
}

if (await portOpen()) {
  console.error(`Port ${PORT} is busy (an old "expo start"?). Stop it and run again.`)
  process.exit(1)
}

const metro = spawn('npx', ['expo', 'start', '--port', String(PORT)], { stdio: 'inherit', shell })
const stop = () => {
  if (shell) spawn('taskkill', ['/pid', String(metro.pid), '/t', '/f'], { stdio: 'ignore' })
  else metro.kill()
}

while (!(await portOpen())) await new Promise((r) => setTimeout(r, 500))

const electron = spawn('npx', ['electron', 'electron/main.js'], {
  stdio: 'inherit',
  shell,
  env: { ...process.env, REVERIE_DEV_URL: `http://localhost:${PORT}` },
})
electron.on('exit', () => {
  stop()
  process.exit(0)
})
process.on('SIGINT', () => (stop(), process.exit(0)))
