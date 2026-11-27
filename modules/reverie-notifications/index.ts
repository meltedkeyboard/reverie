import { requireOptionalNativeModule, type EventSubscription } from 'expo'

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined'

export type NotificationChannelId = 'replies' | 'rooms' | 'reminders' | 'background'

export type NotificationCategoryId = 'chat_reply' | 'room_reply' | 'stream_error' | 'default'

export type NotificationRequest = {
  id: string
  tag?: string
  title: string
  subtitle?: string
  body: string
  channel?: NotificationChannelId
  category?: NotificationCategoryId
  route?: string
  kind?: string
  threadId?: string
  senderName?: string
  isGroup?: boolean
  avatarPath?: string | null
  avatarStyle?: 'communication' | 'attachment' | 'none'
  sound?: boolean
  presentInForeground?: boolean
  delaySeconds?: number
  fireAtMs?: number
  meta?: Record<string, string | number | boolean>
}

export type NotificationActionEvent = {
  id: string
  actionId: string
  route?: string
  kind?: string
  replyText?: string
  meta?: Record<string, string | number | boolean>
}

export type BackgroundExpiringEvent = {
  taskId: number
}

export type CategoryLabels = {
  replyTitle: string
  replyPlaceholder: string
  sendTitle: string
  continueTitle: string
  retryTitle: string
}

export type ChannelLabels = {
  replies: string
  rooms: string
  reminders: string
  background: string
}

export type ScheduledNotificationInfo = {
  id: string
  tag?: string
  fireAtMs?: number
}

type NotificationsNativeModule = {
  getPermissionStatus(): Promise<NotificationPermissionStatus>
  requestPermission(): Promise<NotificationPermissionStatus>
  openSystemSettings(): Promise<void>
  configureCategories(labels: CategoryLabels): void
  configureChannels(labels: ChannelLabels): void
  setActiveRoute(route: string | null): void
  schedule(req: NotificationRequest): Promise<void>
  cancel(id: string): Promise<void>
  cancelByTag(tag: string): Promise<void>
  cancelAll(): Promise<void>
  listScheduled(): Promise<ScheduledNotificationInfo[]>
  consumePendingEvents(): NotificationActionEvent[]
  beginBackgroundTask(name: string): Promise<number>
  endBackgroundTask(taskId: number): void
  addListener(eventName: 'onNotificationAction', listener: (event: NotificationActionEvent) => void): EventSubscription
  addListener(eventName: 'onBackgroundExpiring', listener: (event: BackgroundExpiringEvent) => void): EventSubscription
}

// Missing in Expo Go.
export const reverieNotifications = requireOptionalNativeModule<NotificationsNativeModule>('ReverieNotifications')
