import { fetch } from 'expo/fetch'
import { AppState } from 'react-native'

import type { ThinkingMode } from '@/db/characters'
import { DEFAULT_SETTINGS, type ServerSettings } from '@/db/prefs/settings'
import { t } from '@/i18n'
import { formatContextTokens } from '@/lib/core/context'
import { errorMessage } from '@/lib/core/errors'
import { confirmAsync } from '@/lib/ui/dialogs'

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }

export type ChatRequest = {
  messages: ChatTurn[]
  temperature: number
  maxTokens: number
  topP: number
  // 'auto' omits the field entirely, leaving thinking mode to the server's own setting.
  thinking: ThinkingMode
}

export function normalizeBaseUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  return withScheme.replace(/\/v1$/i, '')
}

function requestHeaders(cfg: ServerSettings) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`
  return headers
}

// Marks errors that already describe a server-side failure, so callers don't wrap
// them again as "unreachable" — independent of the message's language.
class ServerError extends Error {}

// The server answered, but with an error, as opposed to not answering at all.
export function isServerError(err: unknown) {
  return err instanceof ServerError
}

async function readServerError(res: Awaited<ReturnType<typeof fetch>>) {
  const body = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(body)
    const msg = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message
    if (msg) return new ServerError(t('llm.serverError', { status: res.status, msg }))
  } catch {
    // Body is not JSON, fall through to the raw text.
  }
  return new ServerError(t('llm.serverErrorNoMsg', { status: res.status, body: body ? `: ${body.slice(0, 200)}` : '' }))
}

function unreachable(err: unknown) {
  return new Error(t('llm.unreachable', { detail: errorMessage(err) }))
}

class TimeoutError extends Error {}

// A GET that gives up after ms, with the body read inside the same deadline.
async function getJsonWithTimeout(cfg: ServerSettings, url: string, ms: number) {
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

let localNetworkAsked = false

// iOS asks for local network access on the first request to a LAN address, and that
// request fails while the alert is up. So the first test of a session sends a throwaway
// request, and if the alert shows (the app goes inactive), waits for the answer.
async function askLocalNetworkAccess(url: string) {
  if (localNetworkAsked) return
  localNetworkAsked = true

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

export async function testConnection(cfg: ServerSettings) {
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

type ReasoningOption = 'off' | 'on' | 'low' | 'medium' | 'high'

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

function probeJson(cfg: ServerSettings, url: string) {
  return getJsonWithTimeout(cfg, url, 3000).catch(() => null)
}

async function detectServer(cfg: ServerSettings, base: string) {
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

export async function inspectLoadedModel(cfg: ServerSettings, fresh = false): Promise<LoadedModelInfo> {
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
    const isLoaded =
      (Boolean(modelName) &&
        models.some(
          (m: { name?: string; model?: string }) =>
            m.name === modelName ||
            m.model === modelName ||
            m.name?.toLowerCase() === modelName.toLowerCase() ||
            m.model?.toLowerCase() === modelName.toLowerCase(),
        )) ||
      models.length > 0
    return { isLoaded }
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
// against the model first.
async function reasoningFields(cfg: ServerSettings, base: string, mode: ThinkingMode) {
  if (mode === 'auto') return {}
  const kwargs = { chat_template_kwargs: { enable_thinking: mode === 'on' } }
  const server = await detectServer(cfg, base)
  // Ollama's reasoning models think by default, so only "off" needs its own field.
  if (server.kind === 'ollama') return mode === 'off' ? { ...kwargs, reasoning_effort: 'none' } : kwargs
  if (server.kind === 'other') return kwargs

  const name = cfg.model.trim()
  const llms = server.models.filter((m) => m.type === 'llm')
  // With no exact match LM Studio answers with whatever model is loaded.
  const model =
    llms.find((m) => m.key === name || m.loaded_instances?.some((i) => i.id === name)) ??
    llms.find((m) => m.loaded_instances?.length)
  const allowed = model?.capabilities?.reasoning?.allowed_options ?? []

  if (mode === 'off') return allowed.includes('off') ? { reasoning_effort: 'none' } : {}
  if (allowed.includes('on') || allowed.includes('medium')) return { reasoning_effort: 'medium' }
  return {}
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
  cfg: ServerSettings,
  options?: EnsureLoadedOptions,
): Promise<{ loadedContextLength?: number } | null> {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) return null

  // Fast check: is any model already active on the server?
  const info = await inspectLoadedModel(cfg, true)
  if (info.isLoaded) {
    const modelName = cfg.model.trim()
    const isContextMismatch =
      cfg.contextMode === 'tokens' &&
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
          const settingsContext =
            cfg.contextMode === 'tokens'
              ? formatContextTokens(cfg.contextTokens)
              : `${cfg.chatMessages}`

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
            return await loadModel(cfg)
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

// Loads the model into memory, which on a big one takes a while, so there is no deadline.
// LM Studio and Ollama have a call for it; llama.cpp and vLLM serve the model they were
// started with, so there is nothing to load and the connection is all that is checked.
export async function loadModel(cfg: ServerSettings): Promise<{ loadedContextLength?: number }> {
  skippedMismatchKey = null
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) throw new Error(t('llm.baseUrlMissing'))
  const model = cfg.model.trim()
  if (!model) throw new Error(t('llm.setModel'))

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

async function requestCompletion(
  cfg: ServerSettings,
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

  const reasoning = await reasoningFields(cfg, base, req.thinking)
  let res
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: requestHeaders(cfg),
      signal,
      body: JSON.stringify({
        model: cfg.model.trim() || DEFAULT_SETTINGS.model,
        messages: req.messages,
        stream,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        top_p: req.topP,
        ...reasoning,
      }),
    })
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
          retryRes = await fetch(`${base}/v1/chat/completions`, {
            method: 'POST',
            headers: requestHeaders(cfg),
            signal,
            body: JSON.stringify({
              model: cfg.model.trim() || DEFAULT_SETTINGS.model,
              messages: req.messages,
              stream,
              temperature: req.temperature,
              max_tokens: req.maxTokens,
              top_p: req.topP,
              ...reasoning,
            }),
          })
        } catch (retryErr) {
          if (signal?.aborted) throw retryErr
          throw unreachable(retryErr)
        }
        if (!retryRes.ok) throw await readServerError(retryRes)
        return retryRes
      }
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
