import type {
  BackgroundExpiringEvent,
  CategoryLabels,
  ChannelLabels,
  NotificationActionEvent,
  NotificationPermissionStatus,
  NotificationRequest,
  ScheduledNotificationInfo,
} from './index'

type ActionListener = (event: NotificationActionEvent) => void
type ExpiringListener = (event: BackgroundExpiringEvent) => void

const actionListeners = new Set<ActionListener>()
const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; info: ScheduledNotificationInfo }>()

function permissionNow(): NotificationPermissionStatus {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return 'undetermined'
}

function showBrowserNotification(req: NotificationRequest) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const n = new Notification(req.title, {
      body: req.body,
      tag: req.tag ?? req.id,
      silent: req.sound === false,
    })
    n.onclick = () => {
      if (typeof window !== 'undefined') window.focus()
      const event: NotificationActionEvent = {
        id: req.id,
        actionId: 'default',
        route: req.route,
        kind: req.kind,
        meta: req.meta,
      }
      actionListeners.forEach((fn) => fn(event))
      n.close()
    }
  } catch {
    // Ignore environments where Notification constructor is restricted.
  }
}

export const reverieNotifications = {
  async getPermissionStatus(): Promise<NotificationPermissionStatus> {
    return permissionNow()
  },

  async requestPermission(): Promise<NotificationPermissionStatus> {
    if (typeof Notification === 'undefined') return 'denied'
    const res = await Notification.requestPermission()
    return res === 'granted' ? 'granted' : res === 'denied' ? 'denied' : 'undetermined'
  },

  async openSystemSettings(): Promise<void> {},

  configureCategories(_labels: CategoryLabels) {},

  configureChannels(_labels: ChannelLabels) {},

  setActiveRoute(_route: string | null) {},

  async schedule(req: NotificationRequest): Promise<void> {
    const existing = timers.get(req.id)
    if (existing) clearTimeout(existing.timer)
    const now = Date.now()
    const delayMs =
      req.fireAtMs !== undefined
        ? Math.max(0, req.fireAtMs - now)
        : req.delaySeconds !== undefined
          ? Math.max(0, req.delaySeconds * 1000)
          : 0

    if (delayMs <= 0) {
      showBrowserNotification(req)
      return
    }
    const fireAtMs = now + delayMs
    const timer = setTimeout(() => {
      timers.delete(req.id)
      showBrowserNotification(req)
    }, delayMs)
    timers.set(req.id, { timer, info: { id: req.id, tag: req.tag, fireAtMs } })
  },

  async cancel(id: string): Promise<void> {
    const entry = timers.get(id)
    if (entry) {
      clearTimeout(entry.timer)
      timers.delete(id)
    }
  },

  async cancelByTag(tag: string): Promise<void> {
    for (const [id, entry] of timers.entries()) {
      if (entry.info.tag === tag) {
        clearTimeout(entry.timer)
        timers.delete(id)
      }
    }
  },

  async cancelAll(): Promise<void> {
    timers.forEach((entry) => clearTimeout(entry.timer))
    timers.clear()
  },

  async listScheduled(): Promise<ScheduledNotificationInfo[]> {
    return [...timers.values()].map((entry) => entry.info)
  },

  consumePendingEvents(): NotificationActionEvent[] {
    return []
  },

  async beginBackgroundTask(_name: string): Promise<number> {
    return 0
  },

  endBackgroundTask(_taskId: number) {},

  addListener(eventName: 'onNotificationAction' | 'onBackgroundExpiring', listener: ActionListener | ExpiringListener) {
    if (eventName === 'onNotificationAction') {
      const fn = listener as ActionListener
      actionListeners.add(fn)
      return { remove: () => actionListeners.delete(fn) }
    }
    return { remove: () => {} }
  },
}
