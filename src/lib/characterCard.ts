import { fromByteArray, toByteArray } from 'base64-js'

import { t } from '@/i18n'

// Character Card V1/V2/V3: a JSON file, or a PNG with the same JSON in base64 in a text
// chunk (`chara` for V1 and V2, `ccv3` for V3).
export type CardFields = {
  name: string
  systemPrompt: string
  greeting: string
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function isPng(bytes: Uint8Array) {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b)
}

// In slices: spreading a card-sized chunk (hundreds of KB) into one call overflows the stack.
function latin1(bytes: Uint8Array) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return out
}

// The text chunks of a PNG by keyword. tEXt is what cards use; iTXt is read too (without
// compression), since some editors write it.
function pngTextChunks(bytes: Uint8Array) {
  const chunks = new Map<string, string>()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pos = PNG_SIGNATURE.length
  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos)
    const type = latin1(bytes.subarray(pos + 4, pos + 8))
    const body = bytes.subarray(pos + 8, pos + 8 + length)
    if (type === 'tEXt') {
      const nul = body.indexOf(0)
      if (nul > 0) chunks.set(latin1(body.subarray(0, nul)), latin1(body.subarray(nul + 1)))
    } else if (type === 'iTXt') {
      // keyword, NUL, compression flag, method, language, NUL, translated keyword, NUL, text
      const nul = body.indexOf(0)
      if (nul > 0 && body[nul + 1] === 0) {
        const textStart = skipNul(body, skipNul(body, nul + 3))
        chunks.set(latin1(body.subarray(0, nul)), new TextDecoder().decode(body.subarray(textStart)))
      }
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + length
  }
  return chunks
}

// The index just past the next NUL at or after `from`.
function skipNul(body: Uint8Array, from: number) {
  const nul = body.indexOf(0, from)
  return nul < 0 ? body.length : nul + 1
}

function decodeBase64Json(text: string): unknown {
  const bytes = toByteArray(text.replace(/\s/g, ''))
  return JSON.parse(new TextDecoder().decode(bytes))
}

// The card inside a PNG, or null when the picture carries none.
export function readPngCard(bytes: Uint8Array): unknown | null {
  const chunks = pngTextChunks(bytes)
  const text = chunks.get('ccv3') ?? chunks.get('chara')
  return text === undefined ? null : decodeBase64Json(text)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

// A tEXt chunk: keyword, NUL, Latin-1 text (the card is base64, so plain ASCII).
function textChunk(keyword: string, text: string) {
  const body = new Uint8Array(keyword.length + 1 + text.length)
  for (let i = 0; i < keyword.length; i++) body[i] = keyword.charCodeAt(i)
  for (let i = 0; i < text.length; i++) body[keyword.length + 1 + i] = text.charCodeAt(i)
  return pngChunk('tEXt', body)
}

// The PNG with the card in a `chara` text chunk (base64 of the JSON, as every card app
// writes it), put just before IEND. A card the picture already carried is dropped.
export function embedCard(png: Uint8Array, card: unknown) {
  const chunk = textChunk('chara', fromByteArray(new TextEncoder().encode(JSON.stringify(card))))
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const parts = [png.subarray(0, PNG_SIGNATURE.length)]
  let pos = PNG_SIGNATURE.length
  while (pos + 8 <= png.length) {
    const length = view.getUint32(pos)
    const type = latin1(png.subarray(pos + 4, pos + 8))
    const end = pos + 12 + length
    const body = png.subarray(pos + 8, pos + 8 + length)
    const keyword = type === 'tEXt' ? latin1(body.subarray(0, Math.max(body.indexOf(0), 0))) : ''
    if (type === 'IEND') parts.push(chunk)
    if (keyword !== 'chara' && keyword !== 'ccv3') parts.push(png.subarray(pos, end))
    pos = end
  }
  return concat(parts)
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

// A V2 card for sharing. The whole prompt goes in `description`, the field every app reads
// (`system_prompt` is only honored by some), and importing it back gives the same prompt.
export function buildCard(character: CardFields) {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: character.name,
      description: character.systemPrompt,
      personality: '',
      scenario: '',
      first_mes: character.greeting,
      mes_example: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
      tags: [],
      creator: '',
      character_version: '',
      extensions: {},
    },
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

// V1 keeps the fields at the top, V2 and V3 under `data`.
export function parseCard(card: unknown): CardFields {
  const root = (card ?? {}) as Record<string, unknown>
  const data = (typeof root.data === 'object' && root.data !== null ? root.data : root) as Record<string, unknown>
  const name = str(data.name)
  if (!name) throw new Error(t('card.notACard'))

  // {{char}} is the card's own name; {{user}} stays, the model reads it as the person it
  // is talking to.
  const fill = (text: string) => text.replace(/\{\{char\}\}|<BOT>/gi, name)
  const parts = [
    str(data.system_prompt),
    str(data.description),
    str(data.personality) && `Personality: ${str(data.personality)}`,
    str(data.scenario) && `Scenario: ${str(data.scenario)}`,
  ].filter(Boolean)

  return { name, systemPrompt: fill(parts.join('\n\n')), greeting: fill(str(data.first_mes)) }
}
