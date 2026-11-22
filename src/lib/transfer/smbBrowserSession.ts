import type { SmbConfig } from './smbClient'

export type SmbBrowserSession = {
  config: SmbConfig
  initialPath: string
  onSelectPath: (path: string) => void
  onClose?: () => void
}

let activeSession: SmbBrowserSession | null = null

export function openSmbBrowserSession(session: SmbBrowserSession) {
  activeSession = session
}

export function smbBrowserSession(): SmbBrowserSession | null {
  return activeSession
}

export function finishSmbBrowserSession() {
  const session = activeSession
  if (session) {
    activeSession = null
    session.onClose?.()
  }
}
