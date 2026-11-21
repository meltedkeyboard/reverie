import type { Character } from '@/db/characters'
import { createStore } from '@/components/chat/thread/store'
import { isIOS } from '@/lib/core/platform'

export type ThoughtData = {
  token: number
  id: string
  text: string
  ms: number | null
  live: boolean
  speakerName?: string
  speakerAvatar?: string | null
  speakerColor?: string | null
  look?: Pick<
    Character,
    'background' | 'backgroundCrop' | 'backgroundEffect' | 'backgroundIntensity' | 'backgroundBubbleTransparency' | 'backgroundTone'
  > | null
}

export const thoughtSession = createStore<ThoughtData | null>(null)

let token = 0
let dismiss: (() => void) | null = null
let gone: (() => void) | null = null
let after: (() => void) | null = null

// Sheet presentation state tracking (critical on iOS to prevent race conditions during swipe-to-dismiss)
let sheetMounted = false
let sheetClosing = false
let lastClosedAt = 0
let pendingOpen: (() => void) | null = null
let pendingTimeout: ReturnType<typeof setTimeout> | null = null

export function markThoughtMounted() {
  sheetMounted = true
  sheetClosing = false
}

export function markThoughtClosing() {
  sheetClosing = true
  lastClosedAt = Date.now()
}

export function openThoughtSession(data: Omit<ThoughtData, 'token'>, onGone?: () => void): ThoughtData {
  token++
  const session: ThoughtData = { ...data, token }
  thoughtSession.set(session)
  after = null
  gone = onGone ?? null
  return session
}

export function openThought(data: Omit<ThoughtData, 'token'>, pushRoute: () => void) {
  openThoughtSession(data)
  if (!isIOS) return

  // If the sheet is already mounted and not currently closing, the store update is already live!
  if (sheetMounted && !sheetClosing) {
    return
  }

  if (pendingTimeout) {
    clearTimeout(pendingTimeout)
    pendingTimeout = null
  }

  // If closing right now or closed within the last 350ms, iOS UIKit is still completing
  // the interactive dismiss transition. Pushing during this window causes UIKit/react-native-screens
  // to dismiss the newly pushed screen immediately when the pending dismissal completes.
  const timeSinceClose = Date.now() - lastClosedAt
  if (sheetClosing || timeSinceClose < 350) {
    const delay = Math.max(60, 360 - timeSinceClose)
    pendingOpen = pushRoute
    pendingTimeout = setTimeout(() => {
      pendingTimeout = null
      if (pendingOpen) {
        const run = pendingOpen
        pendingOpen = null
        sheetMounted = true
        sheetClosing = false
        run()
      }
    }, delay)
    return
  }

  sheetMounted = true
  sheetClosing = false
  pushRoute()
}

export function updateThoughtSession(update: Partial<ThoughtData>) {
  const current = thoughtSession.get()
  if (!current) return
  thoughtSession.set({ ...current, ...update })
}

export function setThoughtDismiss(action: (() => void) | null) {
  dismiss = action
}

export function closeThoughtSession(then?: () => void) {
  markThoughtClosing()
  after = then ?? null
  if (dismiss) dismiss()
  else finishThoughtSession()
}

export function finishThoughtSession(only?: ThoughtData | null) {
  const current = thoughtSession.get()
  if (only && current && only.token !== current.token) return
  sheetMounted = false
  sheetClosing = false
  lastClosedAt = Date.now()

  const done = gone
  const action = after
  gone = null
  after = null
  dismiss = null
  if (action) action()
  if (done) done()

  if (pendingOpen) {
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
    const run = pendingOpen
    pendingOpen = null
    setTimeout(() => {
      sheetMounted = true
      sheetClosing = false
      run()
    }, 60)
  }
}

/**
 * Extracts first words for the shimmering preview line in the chat bubble.
 * Strips any initial markdown headers or thinking process prefixes.
 */
export function thoughtFirstWords(text: string, maxWords = 5, maxChars = 32): string {
  const clean = text
    .replace(/^#+\s+/gm, '')
    .replace(/^(thinking process|thought process):\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return ''
  const words = clean.split(' ')
  let result = ''
  let count = 0
  for (const word of words) {
    const next = result ? `${result} ${word}` : word
    if (next.length > maxChars && result) break
    result = next
    count++
    if (count >= maxWords) break
  }
  return result ? `${result}…` : ''
}
