import { fetch } from 'expo/fetch'
import { AppState } from 'react-native'

import type { ThinkingMode } from '@/db/characters'
import { DEFAULT_SETTINGS, serverName, type ServerProfile, type ServerSettings } from '@/db/prefs/settings'
import { t } from '@/i18n'
import { formatContextTokens } from '@/lib/core/context'
import { errorMessage } from '@/lib/core/errors'
import { isIOS } from '@/lib/core/platform'
import { confirmAsync } from '@/lib/ui/dialogs'
import { showToast } from '@/lib/ui/toast'

// What a call to one server needs of it.
type Server = Pick<ServerProfile, 'baseUrl' | 'apiKey' | 'model' | 'contextTokens'>

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }

export type ChatRequest = {
  messages: ChatTurn[]
  temperature: number
  maxTokens: number
  // What thinking may take on top of maxTokens; none is added with thinking off.
  reasoningBudget?: number
  topP: number
  // 'auto' omits the field entirely, leaving thinking mode to the server's own setting.
  thinking: ThinkingMode
}

// max_tokens covers the thought and the reply together, so the thinking budget is added
// to the reply's own. With 'auto' the model may or may not think, so it is added too: it
// is only a ceiling.
export function tokenLimit(req: Pick<ChatRequest, 'maxTokens' | 'reasoningBudget' | 'thinking'>) {
  return req.maxTokens + (req.thinking === 'off' ? 0 : (req.reasoningBudget ?? 0))
}

export function normalizeBaseUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  return withScheme.replace(/\/v1$/i, '')
}

function requestHeaders(cfg: Server) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`
  return headers
}

// Marks errors that already describe a server-side failure, so callers don't wrap
// them again as "unreachable" -- independent of the message's language.
class ServerError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

// The server answered, but with an error, as opposed to not answering at all.
export function isServerError(err: unknown) {
  return err instanceof ServerError
}

async function readServerError(res: Awaited<ReturnType<typeof fetch>>) {
  const body = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(body)
    const msg = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message
    if (msg) return new ServerError(t('llm.serverError', { status: res.status, msg }), res.status)
  } catch {
    // Body is not JSON, fall through to the raw text.
  }
  return new ServerError(t('llm.serverErrorNoMsg', { status: res.status, body: body ? `: ${body.slice(0, 200)}` : '' }), res.status)
}

// The server did not answer at all, which is what makes another one take over.
class UnreachableError extends Error {}

function unreachable(err: unknown) {
  return new UnreachableError(t('llm.unreachable', { detail: errorMessage(err) }))
}

class TimeoutError extends Error {}

// A GET that gives up after ms, with the body read inside the same deadline.
async function getJsonWithTimeout(cfg: Server, url: string, ms: number) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { headers: requestHeaders(cfg), signal: ctrl.signal })
    if (!res.ok) throw await readServerError(res)
    return await res.json()
  } catch (err) {
    throw ctrl.signal.aborted ? new TimeoutError() : err
  } finally {
    clearTimeout(timer)
  }
}

let localNetwork: Promise<void> | null = null

// iOS asks for local network access on the first request to a LAN address, and that
// request fails while the alert is up. So the first request of a session is a throwaway
// one, and if the alert shows (the app goes inactive), the real one waits for the answer.
// Every caller waits on the same ask, so a test made while it is still up waits too.
export function askLocalNetworkAccess(url: string) {
  localNetwork ??= probeLocalNetwork(url)
  return localNetwork
}

// Asks ahead, from onboarding's server page, so the alert comes up as the page opens rather
// than over the first test. No address is typed yet on a first run, and any address of a home
// network brings the alert up.
export function primeLocalNetworkAccess(baseUrl: string) {
  if (!isIOS) return
  const base = normalizeBaseUrl(baseUrl)
  void askLocalNetworkAccess(base ? `${base}/v1/models` : 'http://192.168.1.1/')
}

async function probeLocalNetwork(url: string) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2000)
  await fetch(url, { signal: ctrl.signal }).catch(() => null)
  clearTimeout(timer)

  await new Promise(resolve => setTimeout(resolve, 300))
  if (AppState.currentState === 'active') return
  await new Promise<void>(resolve => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return
      sub.remove()
      resolve()
    })
  })
}

export async function testConnection(cfg: Server) {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) throw new Error(t('llm.setBaseUrl'))

  await askLocalNetworkAccess(`${base}/v1/models`)

  try {
    const body = await getJsonWithTimeout(cfg, `${base}/v1/models`, 8000)
    const models: string[] = Array.isArray(body?.data) ? body.data.map((m: { id: string }) => m.id) : []
    return models
  } catch (err) {
    if (err instanceof TimeoutError) throw new Error(t('llm.timeout'))
    if (err instanceof ServerError) throw err
    throw unreachable(err)
  }
}

type ReasoningOption = 'off' | 'on' | 'none' | 'low' | 'medium' | 'high' | 'minimal' | 'xhigh'

type NativeModel = {
  type: string
  key: string
  max_context_length?: number
  loaded_instances?: { id: string; config?: { context_length?: number } }[]
  capabilities?: { reasoning?: { allowed_options: ReasoningOption[]; default: ReasoningOption } }
}

// Each server switches thinking its own way, so which one this is gets looked up once.
// LM Studio's native model list also says per model which reasoning settings it accepts.
type ServerKind = { kind: 'lmstudio'; models: NativeModel[] } | { kind: 'ollama' } | { kind: 'other' }

const serverKinds = new Map<string, { at: number; server: ServerKind }>()
const SERVER_KIND_TTL = 60_000

function probeJson(cfg: Server, url: string) {
  return getJsonWithTimeout(cfg, url, 3000).catch(() => null)
}

async function detectServer(cfg: Server, base: string) {
  const cached = serverKinds.get(base)
  if (cached && Date.now() - cached.at < SERVER_KIND_TTL) return cached.server

  let server: ServerKind = { kind: 'other' }
  const lmstudio = await probeJson(cfg, `${base}/api/v1/models`)
  if (Array.isArray(lmstudio?.models)) {
    server = { kind: 'lmstudio', models: lmstudio.models }
  } else {
    const ollama = await probeJson(cfg, `${base}/api/version`)
    if (typeof ollama?.version === 'string') server = { kind: 'ollama' }
  }
  serverKinds.set(base, { at: Date.now(), server })
  return server
}

export type LoadedModelInfo = {
  isLoaded: boolean
  loadedContextLength?: number
  maxContextLength?: number
  modelName?: string
}

export type LoadedModelEntry = {
  id: string
  key: string
  contextLength?: number
  sizeVram?: number
  paramSize?: string
}

export async function listLoadedModels(cfg: Server, fresh = false): Promise<LoadedModelEntry[]> {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) return []

  if (fresh) {
    serverKinds.delete(base)
  }
  const server = await detectServer(cfg, base)

  if (server.kind === 'lmstudio') {
    const list: LoadedModelEntry[] = []
    const llms = server.models.filter((m) => m.type === 'llm')
    for (const m of llms) {
      if (m.loaded_instances && m.loaded_instances.length > 0) {
        for (let i = 0; i < m.loaded_instances.length; i++) {
          const inst = m.loaded_instances[i]
          list.push({
            id: inst.id || (m.loaded_instances.length > 1 ? `${m.key}:${i}` : m.key),
            key: m.key,
            contextLength: typeof inst.config?.context_length === 'number' ? inst.config.context_length : undefined,
          })
        }
      }
    }
    return list
  }

  if (server.kind === 'ollama') {
    const ps = await probeJson(cfg, `${base}/api/ps`)
    const models = Array.isArray(ps?.models) ? ps.models : []
    return models.map((m: { name?: string; model?: string; size_vram?: number; details?: { parameter_size?: string } }) => ({
      id: m.name || m.model || '',
      key: m.model || m.name || '',
      sizeVram: typeof m.size_vram === 'number' ? m.size_vram : undefined,
      paramSize: m.details?.parameter_size,
    }))
  }

  return []
}

export async function unloadSingleModel(
  cfg: Server,
  target: string | { id?: string; key?: string },
): Promise<void> {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) return
  serverKinds.delete(base)
  const server = await detectServer(cfg, base)

  const instanceId = typeof target === 'string' ? target : target.id
  const modelKey = typeof target === 'string' ? target : target.key

  if (server.kind === 'lmstudio') {
    let unloaded = false
    if (instanceId) {
      try {
        const res = await fetch(`${base}/api/v1/models/unload`, {
          method: 'POST',
          headers: requestHeaders(cfg),
          body: JSON.stringify({ instance_id: instanceId }),
        })
        if (res.ok) unloaded = true
      } catch {
        // Ignore
      }
    }
    if (!unloaded && modelKey) {
      try {
        await fetch(`${base}/api/v1/models/unload`, {
          method: 'POST',
          headers: requestHeaders(cfg),
          body: JSON.stringify({ model: modelKey }),
        })
      } catch {
        // Ignore
      }
    }
    serverKinds.delete(base)
    return
  }

  if (server.kind === 'ollama') {
    const model = modelKey || instanceId
    if (model) {
      try {
        await fetch(`${base}/api/generate`, {
          method: 'POST',
          headers: requestHeaders(cfg),
          body: JSON.stringify({ model, keep_alive: 0 }),
        })
      } catch {
        // Ignore
      }
    }
    serverKinds.delete(base)
    return
  }
}

export async function inspectLoadedModel(cfg: Server, fresh = false): Promise<LoadedModelInfo> {
  const base = normalizeBaseUrl(cfg.baseUrl)
  const modelName = cfg.model.trim()
  if (!base) return { isLoaded: false }

  if (fresh) {
    serverKinds.delete(base)
  }
  const server = await detectServer(cfg, base)

  if (server.kind === 'lmstudio') {
    const llms = server.models.filter((m) => m.type === 'llm')
    const directLoaded = modelName
      ? llms.find(
          (m) =>
            m.loaded_instances &&
            m.loaded_instances.length > 0 &&
            (m.key === modelName ||
              m.key.toLowerCase() === modelName.toLowerCase() ||
              m.loaded_instances.some((i) => i.id === modelName || i.id.toLowerCase() === modelName.toLowerCase()) ||
              m.key.toLowerCase().startsWith(modelName.toLowerCase()) ||
              modelName.toLowerCase().startsWith(m.key.toLowerCase())),
        )
      : undefined

    const anyLoaded = llms.find((m) => m.loaded_instances && m.loaded_instances.length > 0)

    const match =
      directLoaded ??
      (modelName
        ? llms.find(
            (m) =>
              m.key === modelName ||
              m.key.toLowerCase() === modelName.toLowerCase() ||
              m.key.toLowerCase().startsWith(modelName.toLowerCase()) ||
              modelName.toLowerCase().startsWith(m.key.toLowerCase()),
          )
        : undefined)

    const active = directLoaded ?? anyLoaded

    if (active && active.loaded_instances && active.loaded_instances.length > 0) {
      const instance = active.loaded_instances[0]
      const loadedContext = instance.config?.context_length
      return {
        isLoaded: true,
        loadedContextLength: typeof loadedContext === 'number' ? loadedContext : undefined,
        maxContextLength: typeof active.max_context_length === 'number' ? active.max_context_length : undefined,
        modelName: instance.id || active.key,
      }
    }

    return {
      isLoaded: false,
      maxContextLength: typeof match?.max_context_length === 'number' ? match.max_context_length : undefined,
    }
  }

  if (server.kind === 'ollama') {
    const ps = await probeJson(cfg, `${base}/api/ps`)
    const models = Array.isArray(ps?.models) ? ps.models : []
    const matching = models.find(
      (m: { name?: string; model?: string }) =>
        m.name === modelName ||
        m.model === modelName ||
        m.name?.toLowerCase() === modelName.toLowerCase() ||
        m.model?.toLowerCase() === modelName.toLowerCase(),
    )
    const active = matching ?? models[0]
    const isLoaded = models.length > 0
    return {
      isLoaded,
      modelName: active ? (active.model || active.name) : undefined,
    }
  }

  if (server.kind === 'other') {
    const models = await probeJson(cfg, `${base}/v1/models`)
    if (Array.isArray(models?.data) && models.data.length > 0) {
      return { isLoaded: true }
    }
    return { isLoaded: false }
  }

  return { isLoaded: false }
}

// llama.cpp and vLLM switch thinking with chat_template_kwargs. LM Studio and Ollama
// ignore it and take reasoning_effort instead, where "none" is off and any other
// effort is on. LM Studio rejects a setting the model doesn't allow, so it is checked
// against the model first. LM Studio also cuts the thought off at thinking_budget_tokens
// and lets the model answer, so the budget holds there whatever the model's habits;
// elsewhere it is only the share of max_tokens set aside for thinking.
async function reasoningFields(cfg: Server, base: string, mode: ThinkingMode, budget?: number) {
  if (mode === 'auto' && !budget) return {}
  const server = await detectServer(cfg, base)
  const capped = server.kind === 'lmstudio' && mode !== 'off' && budget ? { thinking_budget_tokens: budget } : {}
  if (mode === 'auto') return capped
  const kwargs = { chat_template_kwargs: { enable_thinking: mode === 'on' } }
  // Ollama's reasoning models think by default, so only "off" needs its own field.
  if (server.kind === 'ollama') return mode === 'off' ? { ...kwargs, reasoning_effort: 'none' } : kwargs
  if (server.kind === 'other') return kwargs

  const name = cfg.model.trim().toLowerCase()
  const llms = server.models.filter((m) => m.type === 'llm')
  // With no exact match LM Studio answers with whatever model is loaded.
  const model =
    (name
      ? llms.find(
          (m) =>
            m.key.toLowerCase() === name ||
            m.loaded_instances?.some((i) => i.id.toLowerCase() === name) ||
            m.key.toLowerCase().startsWith(name) ||
            name.startsWith(m.key.toLowerCase()),
        )
      : undefined) ??
    llms.find((m) => m.loaded_instances?.length) ??
    llms[0]
  const allowed = model?.capabilities?.reasoning?.allowed_options ?? []

  if (mode === 'off') {
    const allowsOff = allowed.includes('off') || allowed.includes('none') || !!model?.capabilities?.reasoning
    return {
      ...kwargs,
      ...(allowsOff ? { reasoning_effort: 'none' } : {}),
    }
  }
  const effort =
    allowed.includes('medium') ? 'medium' :
    allowed.includes('on') ? 'medium' :
    allowed.includes('high') ? 'high' :
    allowed.includes('low') ? 'low' :
    allowed.includes('minimal') ? 'minimal' :
    allowed.includes('xhigh') ? 'xhigh' : undefined
  return {
    ...kwargs,
    ...(effort ? { reasoning_effort: effort } : {}),
    ...capped,
  }
}

let activeLoadPromise: Promise<{ loadedContextLength?: number } | null> | null = null

export type EnsureLoadedOptions = {
  // If true, prompts the user with a modal dialog when an active model
  // on the server has a different context window or model name than in settings.
  interactive?: boolean
}

let skippedMismatchKey: string | null = null

export function resetSkippedModelMismatch() {
  skippedMismatchKey = null
}

// Ensures the model is loaded on the server before a request is made.
// If the server already has an active model with matching configuration, it does NOT reload it.
// If there is a mismatch and options.interactive is true, it prompts the user with a modal dialog.
export async function ensureModelLoaded(
  cfg: Server,
  options?: EnsureLoadedOptions,
): Promise<{ loadedContextLength?: number } | null> {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) return null

  // Fast check: is any model already active on the server?
  const info = await inspectLoadedModel(cfg, true)
  if (info.isLoaded) {
    const modelName = cfg.model.trim()
    const isContextMismatch =
      typeof info.loadedContextLength === 'number' &&
      info.loadedContextLength !== cfg.contextTokens

    const isModelMismatch =
      Boolean(modelName) &&
      Boolean(info.modelName) &&
      modelName.toLowerCase() !== info.modelName?.toLowerCase()

    if (isContextMismatch || isModelMismatch) {
      if (options?.interactive) {
        const mismatchKey = `${info.modelName ?? ''}:${info.loadedContextLength ?? ''}->${modelName}:${cfg.contextTokens}`
        if (skippedMismatchKey !== mismatchKey) {
          const serverModel = info.modelName || modelName || '—'
          const serverContext =
            typeof info.loadedContextLength === 'number'
              ? formatContextTokens(info.loadedContextLength)
              : '—'
          const settingsModel = modelName || '—'
          const settingsContext = formatContextTokens(cfg.contextTokens)

          const shouldReload = await confirmAsync({
            title: t('chat.reloadModalTitle'),
            message: t('chat.reloadModalMessage', {
              serverModel,
              serverContext,
              settingsModel,
              settingsContext,
            }),
            confirmLabel: t('chat.reloadModalConfirm'),
            cancelLabel: t('chat.reloadModalKeep'),
          })

          if (shouldReload) {
            skippedMismatchKey = null
            return await loadModel(cfg, { replace: true })
          } else {
            // User chose to keep the old model
            skippedMismatchKey = mismatchKey
            return { loadedContextLength: info.loadedContextLength }
          }
        }
      }
    }

    // Model is already active on the server: do not reload!
    return { loadedContextLength: info.loadedContextLength }
  }

  // Model is not loaded on the server: load it
  if (activeLoadPromise) {
    return await activeLoadPromise
  }

  activeLoadPromise = (async () => {
    try {
      return await loadModel(cfg)
    } finally {
      activeLoadPromise = null
    }
  })()

  return await activeLoadPromise
}

export type LoadModelOptions = {
  // Clears server memory before loading so models do not stack up.
  replace?: boolean
}

// Unloads active models from server memory (LM Studio and Ollama).
export async function unloadModel(cfg: Server): Promise<void> {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) return
  serverKinds.delete(base)
  const server = await detectServer(cfg, base)

  if (server.kind === 'lmstudio') {
    const instances: string[] = []
    const modelKeys: string[] = []
    for (const m of server.models) {
      if (m.loaded_instances && m.loaded_instances.length > 0) {
        modelKeys.push(m.key)
        for (const inst of m.loaded_instances) {
          if (inst.id) instances.push(inst.id)
        }
      }
    }

    for (const instanceId of instances) {
      try {
        await fetch(`${base}/api/v1/models/unload`, {
          method: 'POST',
          headers: requestHeaders(cfg),
          body: JSON.stringify({ instance_id: instanceId }),
        })
      } catch {
        // Failure on one instance does not block unloading remaining instances.
      }
    }

    for (const model of modelKeys) {
      try {
        await fetch(`${base}/api/v1/models/unload`, {
          method: 'POST',
          headers: requestHeaders(cfg),
          body: JSON.stringify({ model }),
        })
      } catch {
        // Ignore
      }
    }

    const fallbackModel = cfg.model.trim()
    if (fallbackModel && !modelKeys.includes(fallbackModel)) {
      try {
        await fetch(`${base}/api/v1/models/unload`, {
          method: 'POST',
          headers: requestHeaders(cfg),
          body: JSON.stringify({ model: fallbackModel }),
        })
      } catch {
        // Ignore
      }
    }

    serverKinds.delete(base)
    return
  }

  if (server.kind === 'ollama') {
    try {
      const ps = await probeJson(cfg, `${base}/api/ps`)
      const running = Array.isArray(ps?.models) ? ps.models : []
      for (const m of running) {
        const model = m.model || m.name
        if (model) {
          await fetch(`${base}/api/generate`, {
            method: 'POST',
            headers: requestHeaders(cfg),
            body: JSON.stringify({ model, keep_alive: 0 }),
          }).catch(() => null)
        }
      }
      const model = cfg.model.trim()
      if (model) {
        await fetch(`${base}/api/generate`, {
          method: 'POST',
          headers: requestHeaders(cfg),
          body: JSON.stringify({ model, keep_alive: 0 }),
        }).catch(() => null)
      }
    } catch {
      // Ignore
    }
    serverKinds.delete(base)
    return
  }
}

export const unloadAllModels = unloadModel

// Loads the model into memory, which on a big one takes a while, so there is no deadline.
// LM Studio and Ollama have a call for it; llama.cpp and vLLM serve the model they were
// started with, so there is nothing to load and the connection is all that is checked.
export async function loadModel(
  cfg: Server,
  options?: LoadModelOptions,
): Promise<{ loadedContextLength?: number }> {
  skippedMismatchKey = null
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) throw new Error(t('llm.baseUrlMissing'))
  const model = cfg.model.trim()
  if (!model) throw new Error(t('llm.setModel'))

  if (options?.replace) {
    await unloadModel(cfg).catch(() => {})
  }

  await askLocalNetworkAccess(`${base}/v1/models`)
  serverKinds.delete(base)
  const server = await detectServer(cfg, base)
  if (server.kind === 'other') {
    await testConnection(cfg)
    return {}
  }

  const contextLength = cfg.contextTokens

  const [path, body] =
    server.kind === 'lmstudio'
      ? ['/api/v1/models/load', { model, context_length: contextLength, echo_load_config: true }]
      : ['/api/generate', { model, prompt: '', stream: false, options: { num_ctx: contextLength } }]
  let res
  try {
    res = await fetch(`${base}${path}`, { method: 'POST', headers: requestHeaders(cfg), body: JSON.stringify(body) })
  } catch (err) {
    throw unreachable(err)
  }
  if (!res.ok) throw await readServerError(res)

  let loadedContextLength: number | undefined
  try {
    const text = await res.text()
    if (text) {
      const data = JSON.parse(text)
      if (typeof data?.load_config?.context_length === 'number') {
        loadedContextLength = data.load_config.context_length
      }
    }
  } catch {
    // Non-JSON or parsing error
  }

  serverKinds.delete(base)
  return { loadedContextLength: loadedContextLength ?? contextLength }
}

// Switching over. A server that did not answer is passed over for a minute and then tried first
// again, which is how the replies come back to it once it is up. One that answered in the last
// half a minute is not checked before a request, so while things work a message costs nothing
// more; the check is there because a request to a LAN address that is down hangs for a long
// time before it fails.
const DOWN_FOR = 60_000
const UP_FOR = 30_000
const PROBE_MS = 4000
const downUntil = new Map<string, number>()
const upAt = new Map<string, number>()
// Who answered last in place of each current server, so a switch is told once, not per reply.
const answering = new Map<string, string>()

// Only a server that is not there hands the reply on: one that answered with an error (no such
// model, a bad request) would answer the next one the same way.
function isOutage(err: unknown) {
  return (
    err instanceof UnreachableError ||
    err instanceof TimeoutError ||
    (err instanceof ServerError && (err.status === 502 || err.status === 503 || err.status === 504))
  )
}

// Whether the server answers at all: an error it sends back still counts as an answer.
export async function probeServer(cfg: Server) {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) return false
  await askLocalNetworkAccess(`${base}/v1/models`)
  try {
    await getJsonWithTimeout(cfg, `${base}/v1/models`, PROBE_MS)
  } catch (err) {
    if (!(err instanceof ServerError) || isOutage(err)) return false
  }
  upAt.set(base, Date.now())
  return true
}

function answersLately(base: string) {
  return Date.now() - (upAt.get(base) ?? 0) < UP_FOR
}

function tellSwitch(current: ServerProfile, server: ServerProfile) {
  const own = normalizeBaseUrl(current.baseUrl)
  const base = normalizeBaseUrl(server.baseUrl)
  const before = answering.get(own) ?? own
  answering.set(own, base)
  if (before === base) return
  if (base === own) {
    showToast({ tone: 'info', title: t('servers.backTitle', { name: serverName(current) }) })
  } else {
    showToast({
      tone: 'info',
      title: t('servers.switchedTitle', { name: serverName(server) }),
      message: t('servers.switchedMessage', { name: serverName(current) }),
    })
  }
}

// The current server first and the others in their order, those that just failed last. A
// reply that has begun to come is not moved: only a server that gave no answer is passed by.
async function requestCompletion(
  cfg: ServerSettings,
  req: ChatRequest,
  stream: boolean,
  signal?: AbortSignal,
  options?: EnsureLoadedOptions,
) {
  if (!cfg.fallbacks.length) return requestFrom(cfg, req, stream, signal, options)

  const now = Date.now()
  const isDown = (s: ServerProfile) => (downUntil.get(normalizeBaseUrl(s.baseUrl)) ?? 0) > now
  const all: ServerProfile[] = [cfg, ...cfg.fallbacks]
  const order = [...all.filter((s) => !isDown(s)), ...all.filter(isDown)]
  let failure: unknown
  for (const server of order) {
    if (signal?.aborted) throw signal.reason ?? new Error('Aborted')
    const base = normalizeBaseUrl(server.baseUrl)
    try {
      if (!answersLately(base) && !(await probeServer(server))) throw new UnreachableError(t('servers.noAnswer'))
      const res = await requestFrom(server, req, stream, signal, options)
      downUntil.delete(base)
      upAt.set(base, Date.now())
      tellSwitch(cfg, server)
      return res
    } catch (err) {
      if (signal?.aborted || !isOutage(err)) throw err
      downUntil.set(base, Date.now() + DOWN_FOR)
      upAt.delete(base)
      failure ??= err
    }
  }
  throw failure
}

async function requestFrom(
  cfg: Server,
  req: ChatRequest,
  stream: boolean,
  signal?: AbortSignal,
  options?: EnsureLoadedOptions,
) {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) throw new Error(t('llm.baseUrlMissing'))

  // Auto-load model if not active on the server
  try {
    await ensureModelLoaded(cfg, options)
  } catch (err) {
    if (signal?.aborted) throw err
    // If auto-load fails, proceed to /v1/chat/completions so the server can report the error
  }

  if (signal?.aborted) throw signal.reason ?? new Error('Aborted')

  const reasoning = await reasoningFields(cfg, base, req.thinking, req.reasoningBudget)
  const postChat = (includeReasoning: boolean) =>
    fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: requestHeaders(cfg),
      signal,
      body: JSON.stringify({
        model: cfg.model.trim() || DEFAULT_SETTINGS.model,
        messages: req.messages,
        stream,
        temperature: req.temperature,
        max_tokens: tokenLimit(req),
        top_p: req.topP,
        ...(includeReasoning ? reasoning : {}),
      }),
    })

  let res
  try {
    res = await postChat(true)
  } catch (err) {
    if (signal?.aborted) throw err
    throw unreachable(err)
  }
  if (!res.ok) {
    const err = await readServerError(res)
    const isNotLoaded = /not\s+loaded|no\s+model|load\s+a\s+model|load\s+model/i.test(err.message)
    if (isNotLoaded && !signal?.aborted) {
      const info = await inspectLoadedModel(cfg, true).catch(() => null)
      if (!info?.isLoaded) {
        await loadModel(cfg)
        if (signal?.aborted) throw signal.reason ?? new Error('Aborted')
        let retryRes
        try {
          retryRes = await postChat(true)
        } catch (retryErr) {
          if (signal?.aborted) throw retryErr
          throw unreachable(retryErr)
        }
        if (retryRes.ok) return retryRes
        if (Object.keys(reasoning).length > 0 && (retryRes.status === 400 || retryRes.status === 422)) {
          let fallbackRes
          try {
            fallbackRes = await postChat(false)
          } catch (fallbackErr) {
            if (signal?.aborted) throw fallbackErr
            throw unreachable(fallbackErr)
          }
          if (fallbackRes.ok) return fallbackRes
        }
        throw await readServerError(retryRes)
      }
    }
    // If the server rejected thinking / reasoning kwargs (400 or 422), retry once without them
    if (Object.keys(reasoning).length > 0 && (res.status === 400 || res.status === 422) && !signal?.aborted) {
      let fallbackRes
      try {
        fallbackRes = await postChat(false)
      } catch (retryErr) {
        if (signal?.aborted) throw retryErr
        throw unreachable(retryErr)
      }
      if (fallbackRes.ok) return fallbackRes
    }
    throw err
  }
  return res
}

export async function completeChat(
  cfg: ServerSettings,
  req: ChatRequest,
  signal?: AbortSignal,
  options?: EnsureLoadedOptions,
) {
  const body = await (await requestCompletion(cfg, req, false, signal, options)).json()
  const content = body?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

// 'cutoff' carries no text: the server stopped at max_tokens rather than at the end of
// the reply. A reasoning model can spend the whole budget thinking and never answer.
export type StreamPart = { kind: 'reasoning' | 'content' | 'cutoff'; text: string }

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'

// Reasoning models spend most of the time thinking before the reply. Servers send that
// part either as a separate delta field or inline as <think>...</think> at the start of
// the content; both are split out here so the chat can show the thinking as it happens.
class ThinkSplitter {
  private buf = ''
  private state: 'start' | 'think' | 'content' = 'start'

  push(chunk: string): StreamPart[] {
    if (this.state === 'content') return [{ kind: 'content', text: chunk }]
    this.buf += chunk
    if (this.state === 'start') {
      const head = this.buf.trimStart()
      // Not enough text yet to tell whether the reply opens with the tag.
      if (head.length < THINK_OPEN.length && THINK_OPEN.startsWith(head)) return []
      if (!head.startsWith(THINK_OPEN)) {
        this.state = 'content'
        return this.take('content', this.buf.length)
      }
      this.state = 'think'
      this.buf = head.slice(THINK_OPEN.length)
    }
    const end = this.buf.indexOf(THINK_CLOSE)
    if (end < 0) {
      // The closing tag may be split between chunks, so its possible start is held back.
      return this.take('reasoning', Math.max(0, this.buf.length - THINK_CLOSE.length))
    }
    const parts = this.take('reasoning', end)
    this.buf = this.buf.slice(THINK_CLOSE.length)
    this.state = 'content'
    return [...parts, ...this.take('content', this.buf.length)]
  }

  flush(): StreamPart[] {
    return this.take(this.state === 'think' ? 'reasoning' : 'content', this.buf.length)
  }

  private take(kind: StreamPart['kind'], length: number): StreamPart[] {
    const text = this.buf.slice(0, length)
    this.buf = this.buf.slice(length)
    return text ? [{ kind, text }] : []
  }
}

export async function* streamChat(
  cfg: ServerSettings,
  req: ChatRequest,
  signal: AbortSignal,
  options?: EnsureLoadedOptions,
) {
  const res = await requestCompletion(cfg, req, true, signal, options)
  if (!res.body) throw new Error(t('llm.noStreaming'))

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const splitter = new ThinkSplitter()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      let nl = buf.indexOf('\n')
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        nl = buf.indexOf('\n')
        if (!line.startsWith('data:')) continue

        const body = line.slice(5).trim()
        if (body === '[DONE]') {
          yield* splitter.flush()
          return
        }
        let chunk
        try {
          chunk = JSON.parse(body)
        } catch {
          continue
        }
        if (chunk.error) throw new Error(chunk.error.message ?? String(chunk.error))
        const delta = chunk.choices?.[0]?.delta
        // llama.cpp and DeepSeek call the field reasoning_content, LM Studio and
        // OpenRouter call it reasoning.
        const reasoning = delta?.reasoning_content ?? delta?.reasoning
        if (typeof reasoning === 'string' && reasoning) yield { kind: 'reasoning', text: reasoning } as StreamPart
        if (typeof delta?.content === 'string' && delta.content) yield* splitter.push(delta.content)
        if (chunk.choices?.[0]?.finish_reason === 'length') yield { kind: 'cutoff', text: '' } as StreamPart
      }
    }
    yield* splitter.flush()
  } finally {
    reader.cancel().catch(() => {})
  }
}
