import type { SQLiteDatabase } from 'expo-sqlite'

import { completeChat } from '@/api/llm'
import { addMessage, listMessages, type Message } from '@/db/messages'
import { notificationSettingsNow } from '@/db/prefs/notifications'
import { getSetting, loadSettings, setSetting } from '@/db/prefs/settings'
import { t } from '@/i18n'
import { replyPreview, resolveNotificationAvatar } from '@/lib/notifications/events'
import {
  getNotificationPermissionStatus,
  notifyLocal,
  requestNotificationPermission,
} from '@/lib/notifications/service'

const STORAGE_KEY = 'notifications_delayed_messages'

export type DelayedFollowUp = {
  id: string
  chatId: number
  characterId: number | null
  senderName: string
  avatarFile: string | null
  roomTitle?: string
  text: string
  deliverAt: number
}

const listeners = new Map<number, Set<() => void>>()

export function subscribeFollowUps(chatId: number, fn: () => void): () => void {
  let set = listeners.get(chatId)
  if (!set) {
    set = new Set()
    listeners.set(chatId, set)
  }
  set.add(fn)
  return () => {
    set?.delete(fn)
    if (set?.size === 0) listeners.delete(chatId)
  }
}

function notifyDelivered(chatId: number) {
  listeners.get(chatId)?.forEach((fn) => fn())
}

async function readQueue(db: SQLiteDatabase): Promise<DelayedFollowUp[]> {
  const raw = await getSetting(db, STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeQueue(db: SQLiteDatabase, items: DelayedFollowUp[]): Promise<void> {
  await setSetting(db, STORAGE_KEY, JSON.stringify(items))
}

export function formatDelayLabel(minutes: number): string {
  if (minutes === 15) return t('notifications.delay15m')
  if (minutes === 60) return t('notifications.delay1h')
  if (minutes === 180) return t('notifications.delay3h')
  if (minutes === 480) return t('notifications.delay8h')
  return `${minutes}m`
}

async function craftFollowUpLine(
  db: SQLiteDatabase,
  senderName: string,
  systemPrompt: string,
  history: Message[]
): Promise<string> {
  const fallback = t('notifications.delayedFallbackBody')
  const cfg = notificationSettingsNow()
  if (!cfg.delayedCharacterMessage.autoGenerate) return fallback
  try {
    const server = await loadSettings(db)
    if (!server.baseUrl.trim()) return fallback
    const recent = history
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'User' : senderName}: ${m.content}`)
      .join('\n')
    const system = [
      systemPrompt.trim(),
      `You are ${senderName}. Some time has passed since the last message. Write one natural, short follow-up message (1-2 sentences) to send in chat as a check-in. Output only the message text.`,
    ]
      .filter(Boolean)
      .join('\n\n')
    const out = await completeChat(server, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: recent || 'Say hello and check in naturally.' },
      ],
      temperature: 0.85,
      maxTokens: 160,
      topP: 0.95,
      thinking: 'off',
    })
    const cleaned = out.trim()
    return cleaned || fallback
  } catch {
    return fallback
  }
}

export async function scheduleDelayedFollowUp(
  db: SQLiteDatabase,
  opts: {
    chatId: number
    characterId: number | null
    senderName: string
    systemPrompt: string
    avatarFile: string | null
    roomTitle?: string
    delayMinutes: number
  }
): Promise<boolean> {
  const cfg = notificationSettingsNow()
  if (!cfg.enabled || !cfg.delayedCharacterMessage.enabled) return false

  let permission = await getNotificationPermissionStatus()
  if (permission === 'undetermined') {
    permission = await requestNotificationPermission()
  }
  if (permission !== 'granted') return false

  const history = await listMessages(db, opts.chatId)
  const text = await craftFollowUpLine(db, opts.senderName, opts.systemPrompt, history)
  const deliverAt = Date.now() + opts.delayMinutes * 60 * 1000
  const id = `followup:${opts.chatId}`

  const existing = await readQueue(db)
  const next = existing.filter((item) => item.id !== id)
  next.push({
    id,
    chatId: opts.chatId,
    characterId: opts.characterId,
    senderName: opts.senderName,
    avatarFile: opts.avatarFile,
    roomTitle: opts.roomTitle,
    text,
    deliverAt,
  })
  await writeQueue(db, next)

  await notifyLocal({
    id,
    tag: id,
    feature: 'delayedCharacterMessage',
    title: opts.roomTitle ? `${opts.senderName} (${opts.roomTitle})` : opts.senderName,
    body: replyPreview(text),
    channel: opts.roomTitle ? 'rooms' : 'replies',
    category: opts.roomTitle ? 'room_reply' : 'chat_reply',
    route: `/chat/${opts.chatId}`,
    kind: 'delayedCharacterMessage',
    threadId: `chat:${opts.chatId}`,
    senderName: opts.senderName,
    isGroup: Boolean(opts.roomTitle),
    avatarPath: resolveNotificationAvatar(opts.avatarFile),
    presentInForeground: true,
    fireAtMs: deliverAt,
    meta: { chatId: opts.chatId },
  })

  return true
}

export async function flushDueFollowUps(db: SQLiteDatabase, onlyChatId?: number): Promise<number> {
  const items = await readQueue(db)
  if (!items.length) return 0
  const now = Date.now()
  const due: DelayedFollowUp[] = []
  const future: DelayedFollowUp[] = []

  for (const item of items) {
    if (item.deliverAt <= now && (onlyChatId === undefined || item.chatId === onlyChatId)) {
      due.push(item)
    } else {
      future.push(item)
    }
  }
  if (!due.length) return 0

  await writeQueue(db, future)
  for (const item of due) {
    await addMessage(db, item.chatId, 'assistant', item.text, {
      speakerId: item.characterId,
    })
    notifyDelivered(item.chatId)
  }
  return due.length
}
