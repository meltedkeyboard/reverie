import { notificationSettingsNow } from '@/db/prefs/notifications'
import { t } from '@/i18n'
import { avatarUri } from '@/lib/images/avatarStore'
import { isVideo } from '@/lib/images/media'
import { isAppBackgrounded, notifyLocal } from '@/lib/notifications/service'

export function resolveNotificationAvatar(file: string | null | undefined): string | null {
  if (!file || isVideo(file)) return null
  return avatarUri(file)
}

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
  avatarFile,
}: {
  chatId: number
  senderName: string
  replyText: string
  elapsedMs: number
  roomTitle?: string
  avatarFile?: string | null
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
    avatarPath: resolveNotificationAvatar(avatarFile),
    presentInForeground: true,
    meta: { chatId },
  })
}

export function notifyRoomAutoplayDone({
  chatId,
  roomTitle,
  spokenCount,
  isAutoplay,
  lastSpeakerName,
  avatarFile,
}: {
  chatId: number
  roomTitle: string
  spokenCount: number
  isAutoplay: boolean
  lastSpeakerName?: string
  avatarFile?: string | null
}) {
  if (!isAppBackgrounded() || spokenCount <= 0) return
  const cfg = notificationSettingsNow()
  if (!cfg.enabled || !cfg.roomAutoplayDone.enabled) return
  if (cfg.roomAutoplayDone.onlyAutoplay && !isAutoplay) return

  const body =
    spokenCount > 1
      ? t('notifications.roomAutoplayCountBody', { count: spokenCount })
      : t('notifications.roomAutoplayDoneBody')

  void notifyLocal({
    id: `reply:${chatId}`,
    tag: `chat:${chatId}`,
    feature: 'roomAutoplayDone',
    title: roomTitle,
    body,
    channel: 'rooms',
    category: 'room_reply',
    route: `/chat/${chatId}`,
    kind: 'roomAutoplayDone',
    threadId: `chat:${chatId}`,
    senderName: lastSpeakerName ?? roomTitle,
    isGroup: true,
    avatarPath: resolveNotificationAvatar(avatarFile),
    presentInForeground: true,
    meta: { chatId },
  })
}
