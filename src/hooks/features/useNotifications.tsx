import { useGlobalSearchParams, useRouter, type Href } from 'expo-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'

import {
  loadNotificationSettings,
  useNotificationSettings,
  type NotificationSettings,
} from '@/db/prefs/notifications'
import { useDatabase } from '@/db/provider'
import { useScreenPathname } from '@/hooks/util/useScreenPathname'
import { useTranslation } from '@/i18n'
import { createRequiredContext } from '@/lib/core/requiredContext'
import { flushDueFollowUps } from '@/lib/notifications/followUp'
import {
  consumePendingNotificationActions,
  dispatchChatNotificationAction,
  getNotificationPermissionStatus,
  notificationsAvailable,
  requestNotificationPermission,
  setActiveNotificationRoute,
  subscribeNotificationActions,
  syncNotificationLabels,
} from '@/lib/notifications/service'
import type { NotificationActionEvent, NotificationPermissionStatus } from '../../../modules/reverie-notifications'

type NotificationsContextValue = {
  available: boolean
  permission: NotificationPermissionStatus
  settings: NotificationSettings
  updateSettings: (patch: Partial<NotificationSettings>) => Promise<void>
  refreshPermission: () => Promise<NotificationPermissionStatus>
  requestPermission: () => Promise<NotificationPermissionStatus>
}

export const [NotificationsContext, useNotifications] =
  createRequiredContext<NotificationsContextValue>('useNotifications must be used within <NotificationsProvider>')

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const db = useDatabase()
  const router = useRouter()
  const pathname = useScreenPathname()
  const params = useGlobalSearchParams<{ id?: string }>()
  const { locale } = useTranslation()
  const [settings, updateSettings] = useNotificationSettings()
  const [permission, setPermission] = useState<NotificationPermissionStatus>('undetermined')

  const refreshPermission = useCallback(async () => {
    const status = await getNotificationPermissionStatus()
    setPermission(status)
    return status
  }, [])

  const requestPermission = useCallback(async () => {
    const status = await requestNotificationPermission()
    setPermission(status)
    return status
  }, [])

  useEffect(() => {
    loadNotificationSettings(db)
    refreshPermission()
    flushDueFollowUps(db).catch(() => {})
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshPermission()
        flushDueFollowUps(db).catch(() => {})
      }
    })
    return () => sub.remove()
  }, [db, refreshPermission])

  useEffect(() => {
    syncNotificationLabels()
  }, [locale, settings.inlineReply.allowContinue])

  useEffect(() => {
    if (pathname.startsWith('/chat/') && params.id) {
      setActiveNotificationRoute(`/chat/${params.id}`)
    } else {
      setActiveNotificationRoute(pathname)
    }
  }, [pathname, params.id])

  const handleActionEvent = useCallback(
    (event: NotificationActionEvent) => {
      const chatIdRaw = event.meta?.chatId
      const chatId = typeof chatIdRaw === 'number' ? chatIdRaw : Number(chatIdRaw)
      if (event.kind === 'delayedCharacterMessage') {
        flushDueFollowUps(db, Number.isFinite(chatId) ? chatId : undefined).catch(() => {})
      }

      if (event.actionId === 'REPLY' && event.replyText?.trim() && Number.isFinite(chatId) && chatId > 0) {
        const handled = dispatchChatNotificationAction({ chatId, actionId: 'REPLY', replyText: event.replyText.trim() })
        if (!handled && event.route) router.push(event.route as Href)
        return
      }
      if (event.actionId === 'CONTINUE' && Number.isFinite(chatId) && chatId > 0) {
        const handled = dispatchChatNotificationAction({ chatId, actionId: 'CONTINUE' })
        if (!handled && event.route) router.push(event.route as Href)
        return
      }
      if (event.actionId === 'RETRY' && Number.isFinite(chatId) && chatId > 0) {
        if (event.route) router.push(event.route as Href)
        dispatchChatNotificationAction({ chatId, actionId: 'RETRY' })
        return
      }
      if (event.route) {
        router.push(event.route as Href)
      }
    },
    [db, router]
  )

  useEffect(() => {
    const pending = consumePendingNotificationActions()
    pending.forEach(handleActionEvent)
    const sub = subscribeNotificationActions(handleActionEvent)
    return () => sub.remove()
  }, [handleActionEvent])

  return (
    <NotificationsContext.Provider
      value={{
        available: notificationsAvailable,
        permission,
        settings,
        updateSettings,
        refreshPermission,
        requestPermission,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}
