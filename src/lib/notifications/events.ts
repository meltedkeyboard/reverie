import { notificationSettingsNow } from '@/db/prefs/notifications'
import { t } from '@/i18n'
import { isAppBackgrounded, notifyLocal } from '@/lib/notifications/service'

export function replyPreview(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= 140) return clean
  return `${clean.slice(0, 137)}...`
}

export function notifyReplyReady({
  chatId,
  senderName,
  replyText,
  elapsedMs,
  roomTitle,
}: {
  chatId: number
  senderName: string
  replyText: string
  elapsedMs: number
  roomTitle?: string
}) {
  if (!isAppBackgrounded()) return
  const cfg = notificationSettingsNow()
  if (!cfg.enabled || !cfg.replyReady.enabled) return
  if (elapsedMs < cfg.replyReady.minSeconds * 1000) return

  const body = cfg.replyReady.showSnippet ? replyPreview(replyText) : t('notifications.replyReadyFallbackBody')
  const title = roomTitle ? `${senderName} (${roomTitle})` : senderName

  void notifyLocal({
    id: `reply:${chatId}`,
    tag: `chat:${chatId}`,
    feature: 'replyReady',
    title,
    body,
    channel: roomTitle ? 'rooms' : 'replies',
    category: roomTitle ? 'room_reply' : 'chat_reply',
    route: `/chat/${chatId}`,
    kind: 'replyReady',
    threadId: `chat:${chatId}`,
    senderName,
    isGroup: Boolean(roomTitle),
    presentInForeground: true,
    meta: { chatId },
  })
}
