import * as Network from 'expo-network'
import { isWeb } from '@/lib/core/platform'
import { reverieSmb, type SmbConfig, type SmbFileItem, type SmbTestResult } from '../../../modules/reverie-smb'

export type { SmbConfig, SmbFileItem, SmbTestResult }

export type DiscoveredSmbServer = {
  host: string
  name: string
}

export const smbAvailable = reverieSmb !== null

export async function testSmbConnection(config: SmbConfig): Promise<SmbTestResult> {
  if (!reverieSmb) return { ok: false, error: 'SMB module unavailable' }
  try {
    return await reverieSmb.testConnection(config)
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

const mockDirectories = new Map<string, SmbFileItem[]>([
  [
    '',
    [
      { name: 'Reverie Sync', isDirectory: true, size: 0, modifiedAt: Date.now() },
      { name: 'Backups', isDirectory: true, size: 0, modifiedAt: Date.now() },
      { name: 'Public', isDirectory: true, size: 0, modifiedAt: Date.now() },
      { name: 'manifest.json', isDirectory: false, size: 1024, modifiedAt: Date.now() },
    ],
  ],
  [
    'Reverie Sync',
    [
      { name: 'Media', isDirectory: true, size: 0, modifiedAt: Date.now() },
      { name: 'Snapshots', isDirectory: true, size: 0, modifiedAt: Date.now() },
      { name: 'reverie.db', isDirectory: false, size: 524288, modifiedAt: Date.now() },
      { name: 'manifest.json', isDirectory: false, size: 2048, modifiedAt: Date.now() },
    ],
  ],
  [
    'Backups',
    [
      { name: '2026-11-20', isDirectory: true, size: 0, modifiedAt: Date.now() },
      { name: '2026-11-22', isDirectory: true, size: 0, modifiedAt: Date.now() },
    ],
  ],
])

export async function listSmbShares(config: SmbConfig): Promise<string[]> {
  if (!reverieSmb || config.host === 'demo.local' || !config.host?.trim()) {
    if (__DEV__) return ['ReverieShare', 'Backups', 'Public']
    return []
  }
  return reverieSmb.listShares(config)
}

export async function listSmbDirectory(config: SmbConfig, path: string): Promise<SmbFileItem[]> {
  if (!reverieSmb || config.host === 'demo.local' || !config.host?.trim()) {
    if (__DEV__) {
      const cleanPath = path.replace(/^\/+|\/+$/g, '')
      const list = mockDirectories.get(cleanPath) ?? []
      return [...list]
    }
    return []
  }
  return reverieSmb.listDirectory(config, path)
}

export async function createSmbDirectory(config: SmbConfig, path: string): Promise<void> {
  if (!reverieSmb || config.host === 'demo.local' || !config.host?.trim()) {
    if (__DEV__) {
      const clean = path.replace(/^\/+|\/+$/g, '')
      const lastSlash = clean.lastIndexOf('/')
      const parent = lastSlash >= 0 ? clean.slice(0, lastSlash) : ''
      const name = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean
      const current = mockDirectories.get(parent) ?? []
      if (!current.some((item) => item.name === name)) {
        mockDirectories.set(parent, [
          ...current,
          { name, isDirectory: true, size: 0, modifiedAt: Date.now() },
        ])
      }
      return
    }
    return
  }
  return reverieSmb.createDirectory(config, path)
}

async function getWifiHosts(): Promise<string[] | null> {
  if (isWeb) return ['127.0.0.1']
  const state = await Network.getNetworkStateAsync().catch(() => null)
  if (state?.type === Network.NetworkStateType.CELLULAR) return null
  const ip = await Network.getIpAddressAsync().catch(() => '')
  const parts = ip.split('.')
  if (parts.length !== 4 || ip === '0.0.0.0') return null
  const own = Number(parts[3])
  const prefix = parts.slice(0, 3).join('.')
  // Neighbors of the phone first
  return Array.from({ length: 254 }, (_, i) => i + 1)
    .filter((n) => n !== own)
    .sort((a, b) => Math.abs(a - own) - Math.abs(b - own))
    .map((n) => `${prefix}.${n}`)
}

// Probes local network for SMB listeners on port 445.
export async function discoverSmbServers(signal: AbortSignal, onFound: (server: DiscoveredSmbServer) => void): Promise<boolean> {
  if (isWeb) {
    onFound({ host: '192.168.1.100', name: 'Synology-NAS (Mock)' })
    onFound({ host: 'nas.local', name: 'TrueNAS-Home (Mock)' })
    return true
  }

  const hosts = await getWifiHosts()
  const smb = reverieSmb
  if (!hosts || !smb) return false

  const AT_ONCE = 24
  let index = 0

  const worker = async () => {
    while (index < hosts.length && !signal.aborted) {
      const host = hosts[index++]
      try {
        const res = await smb.testConnection({ host, port: 445, share: '' })
        if (signal.aborted) return
        if (res.ok) {
          onFound({ host, name: host })
        }
      } catch {
        // Not reachable or not SMB
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(AT_ONCE, hosts.length) }, worker))
  return true
}
