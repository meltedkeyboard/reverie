import { AppState } from 'react-native'

import {
  notificationSettingsNow,
  type NotificationFeatureKey,
  type NotificationSettings,
} from '@/db/prefs/notifications'
import { t } from '@/i18n'
import { isWeb } from '@/lib/core/platform'
import {
  reverieNotifications,
  type BackgroundExpiringEvent,
  type NotificationActionEvent,
  type NotificationCategoryId,
  type NotificationChannelId,
  type NotificationPermissionStatus,
  type NotificationRequest,
  type ScheduledNotificationInfo,
} from '../../../modules/reverie-notifications'

export type LocalNotificationOptions = {
  id: string
  tag?: string
  feature?: NotificationFeatureKey
  title: string
  subtitle?: string
  body: string
  hiddenBody?: string
  channel?: NotificationChannelId
  category?: NotificationCategoryId
  route?: string
  kind?: string
  threadId?: string
  senderName?: string
  isGroup?: boolean
  avatarPath?: string | null
  presentInForeground?: boolean
  delaySeconds?: number
  fireAtMs?: number
  meta?: Record<string, string | number | boolean>
}

export type ChatNotificationAction = {
  chatId: number
  actionId: 'REPLY' | 'CONTINUE' | 'RETRY'
  replyText?: string
}

type ChatActionHandler = (action: ChatNotificationAction) => void

export const notificationsAvailable = reverieNotifications !== null || __DEV__

// Expo Go and dev web builds lack the native module; keep simulated state in memory for UI testing.
let previewPermission: NotificationPermissionStatus = 'undetermined'

let activeRouteNow: string | null = null
const chatActionHandlers = new Map<number, ChatActionHandler>()
const pendingChatActions = new Map<number, ChatNotificationAction[]>()

export function isAppBackgrounded(): boolean {
  if (isWeb) return typeof document !== 'undefined' ? document.hidden : false
  return AppState.currentState !== 'active'
}

export function setActiveNotificationRoute(route: string | null) {
  activeRouteNow = route
  reverieNotifications?.setActiveRoute(route)
}

export function getActiveNotificationRoute(): string | null {
  return activeRouteNow
}

export function isNotificationFeatureEnabled(feature: NotificationFeatureKey, cfg: NotificationSettings = notificationSettingsNow()): boolean {
  return cfg.enabled && cfg[feature].enabled
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!reverieNotifications) return __DEV__ ? previewPermission : 'denied'
  try {
    return await reverieNotifications.getPermissionStatus()
  } catch {
    return 'denied'
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!reverieNotifications) {
    if (!__DEV__) return 'denied'
    previewPermission = 'granted'
    return previewPermission
  }
  try {
    return await reverieNotifications.requestPermission()
  } catch {
    return 'denied'
  }
}

export async function openNotificationSystemSettings(): Promise<void> {
  await reverieNotifications?.openSystemSettings()
}

export function syncNotificationLabels() {
  if (!reverieNotifications) return
  const cfg = notificationSettingsNow()
  reverieNotifications.configureCategories({
    replyTitle: t('notifications.actionReply'),
    replyPlaceholder: t('notifications.actionReplyPlaceholder'),
    sendTitle: t('notifications.actionSend'),
    continueTitle: cfg.inlineReply.allowContinue ? t('notifications.actionContinue') : '',
    retryTitle: t('notifications.actionRetry'),
  })
  reverieNotifications.configureChannels({
    replies: t('notifications.channelReplies'),
    rooms: t('notifications.channelRooms'),
    reminders: t('notifications.channelReminders'),
    background: t('notifications.channelBackground'),
  })
}

function applyPrivacy(opts: LocalNotificationOptions, cfg: NotificationSettings): { title: string; subtitle?: string; body: string } {
  if (cfg.preview === 'hidden') {
    return {
      title: 'Reverie',
      body: opts.hiddenBody ?? t('notifications.hiddenBody'),
    }
  }
  if (cfg.preview === 'nameOnly') {
    return {
      title: opts.title,
      body: opts.hiddenBody ?? t('notifications.nameOnlyBody'),
    }
  }
  return {
    title: opts.title,
    subtitle: opts.subtitle,
    body: opts.body,
  }
}

function resolveAvatar(opts: LocalNotificationOptions, cfg: NotificationSettings): Pick<NotificationRequest, 'avatarPath' | 'avatarStyle'> {
  if (!opts.avatarPath || !cfg.characterAvatar.enabled || cfg.preview === 'hidden') {
    return { avatarPath: null, avatarStyle: 'none' }
  }
  return {
    avatarPath: opts.avatarPath,
    avatarStyle: cfg.characterAvatar.style,
  }
}

function resolveCategory(opts: LocalNotificationOptions, cfg: NotificationSettings): NotificationCategoryId {
  const requested = opts.category ?? 'default'
  if (requested === 'chat_reply' || requested === 'room_reply') {
    return cfg.inlineReply.enabled ? requested : 'default'
  }
  if (requested === 'stream_error') {
    return cfg.inlineReply.enabled ? requested : 'default'
  }
  return requested
}

export async function notifyLocal(opts: LocalNotificationOptions): Promise<boolean> {
  if (!reverieNotifications && !__DEV__) return false
  const cfg = notificationSettingsNow()
  if (!cfg.enabled) return false
  if (opts.feature && !cfg[opts.feature].enabled) return false

  const isImmediate = !opts.fireAtMs && (!opts.delaySeconds || opts.delaySeconds <= 0)
  if (isImmediate && cfg.muteActiveChat && opts.route && activeRouteNow === opts.route && !isAppBackgrounded() && !opts.presentInForeground) {
    return false
  }

  const status = await getNotificationPermissionStatus()
  if (status !== 'granted') return false
  if (!reverieNotifications) return true

  const text = applyPrivacy(opts, cfg)
  const avatar = resolveAvatar(opts, cfg)

  const req: NotificationRequest = {
    id: opts.id,
    tag: opts.tag,
    title: text.title,
    subtitle: text.subtitle,
    body: text.body,
    channel: opts.channel ?? 'replies',
    category: resolveCategory(opts, cfg),
    route: opts.route,
    kind: opts.kind,
    threadId: opts.threadId,
    senderName: cfg.preview === 'hidden' ? undefined : opts.senderName,
    isGroup: opts.isGroup,
    avatarPath: avatar.avatarPath,
    avatarStyle: avatar.avatarStyle,
    sound: cfg.sound,
    presentInForeground: opts.presentInForeground ?? false,
    delaySeconds: opts.delaySeconds,
    fireAtMs: opts.fireAtMs,
    meta: opts.meta,
  }

  await reverieNotifications.schedule(req)
  return true
}

export async function cancelNotification(id: string): Promise<void> {
  await reverieNotifications?.cancel(id)
}

export async function cancelNotificationsByTag(tag: string): Promise<void> {
  await reverieNotifications?.cancelByTag(tag)
}

export async function cancelAllNotifications(): Promise<void> {
  await reverieNotifications?.cancelAll()
}

export async function listScheduledNotifications(): Promise<ScheduledNotificationInfo[]> {
  if (!reverieNotifications) return []
  return reverieNotifications.listScheduled()
}

export function consumePendingNotificationActions(): NotificationActionEvent[] {
  return reverieNotifications?.consumePendingEvents() ?? []
}

export function subscribeNotificationActions(listener: (event: NotificationActionEvent) => void) {
  return reverieNotifications?.addListener('onNotificationAction', listener) ?? { remove: () => {} }
}

export function subscribeBackgroundExpiring(listener: (event: BackgroundExpiringEvent) => void) {
  return reverieNotifications?.addListener('onBackgroundExpiring', listener) ?? { remove: () => {} }
}

export async function withBackgroundTask<T>(name: string, fn: () => Promise<T>, onExpiring?: () => void): Promise<T> {
  if (!reverieNotifications) return fn()
  const taskId = await reverieNotifications.beginBackgroundTask(name).catch(() => 0)
  const sub =
    taskId > 0 && onExpiring
      ? subscribeBackgroundExpiring((event) => {
          if (event.taskId === taskId) onExpiring()
        })
      : null
  try {
    return await fn()
  } finally {
    sub?.remove()
    if (taskId > 0) reverieNotifications.endBackgroundTask(taskId)
  }
}

export function dispatchChatNotificationAction(action: ChatNotificationAction): boolean {
  const handler = chatActionHandlers.get(action.chatId)
  if (handler) {
    handler(action)
    return true
  }
  const queue = pendingChatActions.get(action.chatId) ?? []
  queue.push(action)
  pendingChatActions.set(action.chatId, queue)
  return false
}

export function registerChatNotificationHandler(chatId: number, handler: ChatActionHandler): () => void {
  chatActionHandlers.set(chatId, handler)
  const queued = pendingChatActions.get(chatId)
  if (queued?.length) {
    pendingChatActions.delete(chatId)
    queued.forEach((action) => handler(action))
  }
  return () => {
    if (chatActionHandlers.get(chatId) === handler) {
      chatActionHandlers.delete(chatId)
    }
  }
}
