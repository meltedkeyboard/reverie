import * as Network from 'expo-network'

import { askLocalNetworkAccess } from '@/api/llm'
import { isWeb } from '@/lib/core/platform'

export type FoundServer = {
  baseUrl: string
  // The server it is by its usual port, as nothing in the OpenAI API says so.
  kind: string
  models: string[]
  // It answered, but asks for a key before it lists its models.
  locked: boolean
}

// The ports the local servers listen on unless told otherwise.
const PORTS: { port: number; kind: string }[] = [
  { port: 1234, kind: 'LM Studio' },
  { port: 11434, kind: 'Ollama' },
  { port: 8080, kind: 'llama.cpp' },
  { port: 5001, kind: 'KoboldCpp' },
]

// A computer that is there refuses a closed port at once; only an address with nothing on
// it is waited out, so the deadline is short and many are asked at a time.
const PROBE_MS = 1200
const AT_ONCE = 96

async function probe(baseUrl: string, kind: string, signal: AbortSignal): Promise<FoundServer | null> {
  const ctrl = new AbortController()
  const stop = () => ctrl.abort()
  signal.addEventListener('abort', stop)
  const timer = setTimeout(stop, PROBE_MS)
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { signal: ctrl.signal })
    if (res.status === 401 || res.status === 403) return { baseUrl, kind, models: [], locked: true }
    if (!res.ok) return null
    const body = await res.json()
    if (!Array.isArray(body?.data)) return null
    return { baseUrl, kind, models: body.data.map((m: { id: string }) => m.id).filter(Boolean), locked: false }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', stop)
  }
}

// The addresses to ask: this computer on the web and the desktop, where a page cannot learn
// its own address in the network, and on a phone every address of its Wi-Fi network, taken
// as the usual home network of 256 addresses around the phone's own.
async function hosts(): Promise<string[] | null> {
  if (isWeb) return ['localhost']
  const state = await Network.getNetworkStateAsync().catch(() => null)
  if (state?.type !== Network.NetworkStateType.WIFI && state?.type !== Network.NetworkStateType.ETHERNET) return null
  const ip = await Network.getIpAddressAsync().catch(() => '')
  const parts = ip.split('.')
  if (parts.length !== 4 || ip === '0.0.0.0') return null
  const own = Number(parts[3])
  const prefix = parts.slice(0, 3).join('.')
  // The neighbours of the phone first: a router hands out addresses in a row, so the
  // computers of the house are usually not far from it.
  return Array.from({ length: 254 }, (_, i) => i + 1)
    .filter((n) => n !== own)
    .sort((a, b) => Math.abs(a - own) - Math.abs(b - own))
    .map((n) => `${prefix}.${n}`)
}

// Looks for model servers in the local network, handing each one to onFound as it answers.
// Resolves with false when there is no Wi-Fi to look in.
export async function discoverServers(signal: AbortSignal, onFound: (server: FoundServer) => void) {
  const list = await hosts()
  if (!list) return false
  if (!isWeb) await askLocalNetworkAccess(`http://${list[0]}:${PORTS[0].port}/v1/models`)
  const jobs = list.flatMap((host) => PORTS.map(({ port, kind }) => ({ baseUrl: `http://${host}:${port}`, kind })))
  let next = 0
  const worker = async () => {
    while (next < jobs.length && !signal.aborted) {
      const job = jobs[next++]
      const found = await probe(job.baseUrl, job.kind, signal)
      if (signal.aborted) return
      if (found) onFound(found)
    }
  }
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, jobs.length) }, worker))
  return true
}
