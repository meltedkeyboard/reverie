import { createStore } from '@/components/chat/thread/store'
import type { SmbConfig } from './smbClient'

export type SmbBrowserSession = {
  config: SmbConfig
  initialPath: string
  onSelectPath: (path: string) => void
  onClose?: () => void
}

export const smbBrowserSessionStore = createStore<SmbBrowserSession | null>(null)

export function openSmbBrowserSession(session: SmbBrowserSession) {
  smbBrowserSessionStore.set(session)
}

export function smbBrowserSession(): SmbBrowserSession | null {
  return smbBrowserSessionStore.get()
}

export function finishSmbBrowserSession() {
  const session = smbBrowserSessionStore.get()
  if (session) {
    smbBrowserSessionStore.set(null)
    session.onClose?.()
  }
}
