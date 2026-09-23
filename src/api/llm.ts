import { fetch } from 'expo/fetch'
import { Platform } from 'react-native'

import type { ThinkingMode } from '@/db/characters'
import type { ServerSettings } from '@/db/settings'
import { t } from '@/i18n'

export const CONTEXT_WINDOW = 20

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

// In a browser a request blocked by the same-origin policy looks exactly like an
// unreachable host, and a server started without CORS is the usual reason.
function unreachable(err: unknown) {
  const detail = err instanceof Error ? err.message : String(err)
  const hint = Platform.OS === 'web' ? t('llm.corsHint') : ''
  return new Error(t('llm.unreachable', { detail, hint }))
}

export async function testConnection(cfg: ServerSettings) {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) throw new Error(t('llm.setBaseUrl'))

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(`${base}/v1/models`, { headers: requestHeaders(cfg), signal: ctrl.signal })
    if (!res.ok) throw await readServerError(res)
    const body = await res.json()
    const models: string[] = Array.isArray(body?.data) ? body.data.map((m: { id: string }) => m.id) : []
    return models
  } catch (err) {
    if (ctrl.signal.aborted) throw new Error(t('llm.timeout'))
    if (err instanceof ServerError) throw err
    throw unreachable(err)
  } finally {
    clearTimeout(timer)
  }
}

type ReasoningOption = 'off' | 'on' | 'low' | 'medium' | 'high'

type NativeModel = {
  type: string
  key: string
  loaded_instances?: { id: string }[]
  capabilities?: { reasoning?: { allowed_options: ReasoningOption[]; default: ReasoningOption } }
}

// Each server switches thinking its own way, so which one this is gets looked up once.
// LM Studio's native model list also says per model which reasoning settings it accepts.
type ServerKind = { kind: 'lmstudio'; models: NativeModel[] } | { kind: 'ollama' } | { kind: 'other' }

const serverKinds = new Map<string, { at: number; server: ServerKind }>()
const SERVER_KIND_TTL = 60_000

async function probeJson(cfg: ServerSettings, url: string) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3000)
  try {
    const res = await fetch(url, { headers: requestHeaders(cfg), signal: ctrl.signal })
    return res.ok ? await res.json() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
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

  const models = server.models

  const name = cfg.model.trim()
  const llms = models.filter((m) => m.type === 'llm')
  // With no exact match LM Studio answers with whatever model is loaded.
  const model =
    llms.find((m) => m.key === name || m.loaded_instances?.some((i) => i.id === name)) ??
    llms.find((m) => m.loaded_instances?.length)
  const allowed = model?.capabilities?.reasoning?.allowed_options ?? []

  if (mode === 'off') return allowed.includes('off') ? { reasoning_effort: 'none' } : {}
  if (allowed.includes('on') || allowed.includes('medium')) return { reasoning_effort: 'medium' }
  return {}
}

async function requestCompletion(cfg: ServerSettings, req: ChatRequest, stream: boolean, signal?: AbortSignal) {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base) throw new Error(t('llm.baseUrlMissing'))

  const reasoning = await reasoningFields(cfg, base, req.thinking)
  let res
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: requestHeaders(cfg),
      signal,
      body: JSON.stringify({
        model: cfg.model.trim() || 'local-model',
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
  if (!res.ok) throw await readServerError(res)
  return res
}

export async function completeChat(cfg: ServerSettings, req: ChatRequest) {
  const body = await (await requestCompletion(cfg, req, false)).json()
  const content = body?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

export type StreamPart = { kind: 'reasoning' | 'content'; text: string }

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

export async function* streamChat(cfg: ServerSettings, req: ChatRequest, signal: AbortSignal) {
  const res = await requestCompletion(cfg, req, true, signal)
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
      }
    }
    yield* splitter.flush()
  } finally {
    reader.cancel().catch(() => {})
  }
}
