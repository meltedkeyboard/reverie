import { notificationSettingsNow } from '@/db/prefs/notifications'
import { t } from '@/i18n'
import { avatarUri } from '@/lib/images/avatarStore'
import { isVideo } from '@/lib/images/media'
import {
  getNotificationPermissionStatus,
  isAppBackgrounded,
  notifyLocal,
  requestNotificationPermission,
} from '@/lib/notifications/service'

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

export function notifyStreamInterrupted({
  chatId,
  senderName,
  reason,
  roomTitle,
  avatarFile,
}: {
  chatId: number
  senderName: string
  reason?: string
  roomTitle?: string
  avatarFile?: string | null
}) {
  if (!isAppBackgrounded()) return
  const cfg = notificationSettingsNow()
  if (!cfg.enabled || !cfg.streamInterrupted.enabled) return

  const body =
    cfg.streamInterrupted.includeReason && reason?.trim()
      ? replyPreview(reason)
      : t('notifications.errorNotificationBody')

  void notifyLocal({
    id: `reply:${chatId}`,
    tag: `chat:${chatId}`,
    feature: 'streamInterrupted',
    title: t('notifications.errorNotificationTitle', { name: roomTitle ?? senderName }),
    body,
    channel: roomTitle ? 'rooms' : 'replies',
    category: 'stream_error',
    route: `/chat/${chatId}`,
    kind: 'streamInterrupted',
    threadId: `chat:${chatId}`,
    senderName,
    isGroup: Boolean(roomTitle),
    avatarPath: resolveNotificationAvatar(avatarFile),
    presentInForeground: true,
    meta: { chatId },
  })
}

export async function scheduleSceneReminder({
  chatId,
  name,
  avatarFile,
  isGroup,
  fireAtMs,
}: {
  chatId: number
  name: string
  avatarFile?: string | null
  isGroup?: boolean
  fireAtMs: number
}): Promise<boolean> {
  const cfg = notificationSettingsNow()
  if (!cfg.enabled || !cfg.sceneReminder.enabled) return false

  let permission = await getNotificationPermissionStatus()
  if (permission === 'undetermined') {
    permission = await requestNotificationPermission()
  }
  if (permission !== 'granted') return false

  return notifyLocal({
    id: `reminder:${chatId}`,
    tag: `reminder:${chatId}`,
    feature: 'sceneReminder',
    title: t('notifications.reminderNotifTitle', { name }),
    body: t('notifications.reminderNotifBody'),
    channel: 'reminders',
    category: 'default',
    route: `/chat/${chatId}`,
    kind: 'sceneReminder',
    threadId: `chat:${chatId}`,
    senderName: name,
    isGroup,
    avatarPath: resolveNotificationAvatar(avatarFile),
    presentInForeground: true,
    fireAtMs,
    meta: { chatId },
  })
}

export function notifyGeneratorDone(title: string) {
  if (!isAppBackgrounded()) return
  const cfg = notificationSettingsNow()
  if (!cfg.enabled || !cfg.aiGeneratorsDone.enabled) return

  void notifyLocal({
    id: `gen:${Date.now()}`,
    tag: 'generator',
    feature: 'aiGeneratorsDone',
    title: t('notifications.genDoneTitle', { title }),
    body: t('notifications.genDoneBody'),
    channel: 'background',
    category: 'default',
    route: '/generate',
    kind: 'aiGeneratorsDone',
    presentInForeground: true,
  })
}

export function notifyLongMemoryDone(chatId: number, label: string) {
  if (!isAppBackgrounded()) return
  const cfg = notificationSettingsNow()
  if (!cfg.enabled || !cfg.aiGeneratorsDone.enabled || !cfg.aiGeneratorsDone.includeMemory) return

  void notifyLocal({
    id: `memory:${chatId}`,
    tag: `memory:${chatId}`,
    feature: 'aiGeneratorsDone',
    title: t('notifications.memoryDoneTitle', { name: label }),
    body: t('notifications.memoryDoneBody'),
    channel: 'background',
    category: 'default',
    route: `/chat/${chatId}`,
    kind: 'aiGeneratorsDone',
    threadId: `chat:${chatId}`,
    presentInForeground: true,
    meta: { chatId },
  })
}
