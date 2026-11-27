import { useCallback, useSyncExternalStore } from 'react'
import type { SQLiteDatabase } from 'expo-sqlite'

import { getSetting, setSetting } from '@/db/prefs/settings'
import { useDatabase } from '@/db/provider'

export type NotificationPreviewMode = 'full' | 'nameOnly' | 'hidden'
export type AvatarNotificationStyle = 'communication' | 'attachment'

export type NotificationSettings = {
  enabled: boolean
  sound: boolean
  preview: NotificationPreviewMode
  muteActiveChat: boolean
  replyReady: {
    enabled: boolean
    minSeconds: 0 | 5 | 15 | 30
    showSnippet: boolean
  }
  roomAutoplayDone: {
    enabled: boolean
    onlyAutoplay: boolean
  }
  characterAvatar: {
    enabled: boolean
    style: AvatarNotificationStyle
  }
  inlineReply: {
    enabled: boolean
    allowContinue: boolean
  }
  streamInterrupted: {
    enabled: boolean
    includeReason: boolean
  }
  delayedCharacterMessage: {
    enabled: boolean
    delayMinutes: 15 | 60 | 180 | 480
    autoGenerate: boolean
  }
  sceneReminder: {
    enabled: boolean
    defaultHour: number
  }
  aiGeneratorsDone: {
    enabled: boolean
    includeMemory: boolean
  }
  transferDone: {
    enabled: boolean
    notifySuccess: boolean
    notifyFailure: boolean
  }
}

export type NotificationFeatureKey =
  | 'replyReady'
  | 'roomAutoplayDone'
  | 'characterAvatar'
  | 'inlineReply'
  | 'streamInterrupted'
  | 'delayedCharacterMessage'
  | 'sceneReminder'
  | 'aiGeneratorsDone'
  | 'transferDone'

export const NOTIFICATION_FEATURE_KEYS: readonly NotificationFeatureKey[] = [
  'replyReady',
  'roomAutoplayDone',
  'characterAvatar',
  'inlineReply',
  'streamInterrupted',
  'delayedCharacterMessage',
  'sceneReminder',
  'aiGeneratorsDone',
  'transferDone',
]

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  sound: true,
  preview: 'full',
  muteActiveChat: true,
  replyReady: {
    enabled: true,
    minSeconds: 0,
    showSnippet: true,
  },
  roomAutoplayDone: {
    enabled: true,
    onlyAutoplay: false,
  },
  characterAvatar: {
    enabled: true,
    style: 'communication',
  },
  inlineReply: {
    enabled: true,
    allowContinue: true,
  },
  streamInterrupted: {
    enabled: true,
    includeReason: true,
  },
  delayedCharacterMessage: {
    enabled: true,
    delayMinutes: 60,
    autoGenerate: true,
  },
  sceneReminder: {
    enabled: true,
    defaultHour: 21,
  },
  aiGeneratorsDone: {
    enabled: true,
    includeMemory: true,
  },
  transferDone: {
    enabled: true,
    notifySuccess: true,
    notifyFailure: true,
  },
}

const SETTINGS_KEY = 'notifications_settings'
const ASKED_PERMISSION_KEY = 'notifications_asked_permission'

let currentSettings: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS
const listeners = new Set<() => void>()

function emitChange() {
  listeners.forEach((fn) => fn())
}

function mergeSettings(raw: Partial<NotificationSettings> | null | undefined): NotificationSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_NOTIFICATION_SETTINGS
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_NOTIFICATION_SETTINGS.enabled,
    sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULT_NOTIFICATION_SETTINGS.sound,
    preview: raw.preview === 'full' || raw.preview === 'nameOnly' || raw.preview === 'hidden'
      ? raw.preview
      : DEFAULT_NOTIFICATION_SETTINGS.preview,
    muteActiveChat: typeof raw.muteActiveChat === 'boolean'
      ? raw.muteActiveChat
      : DEFAULT_NOTIFICATION_SETTINGS.muteActiveChat,
    replyReady: { ...DEFAULT_NOTIFICATION_SETTINGS.replyReady, ...raw.replyReady },
    roomAutoplayDone: { ...DEFAULT_NOTIFICATION_SETTINGS.roomAutoplayDone, ...raw.roomAutoplayDone },
    characterAvatar: { ...DEFAULT_NOTIFICATION_SETTINGS.characterAvatar, ...raw.characterAvatar },
    inlineReply: { ...DEFAULT_NOTIFICATION_SETTINGS.inlineReply, ...raw.inlineReply },
    streamInterrupted: { ...DEFAULT_NOTIFICATION_SETTINGS.streamInterrupted, ...raw.streamInterrupted },
    delayedCharacterMessage: { ...DEFAULT_NOTIFICATION_SETTINGS.delayedCharacterMessage, ...raw.delayedCharacterMessage },
    sceneReminder: {
      ...DEFAULT_NOTIFICATION_SETTINGS.sceneReminder,
      ...raw.sceneReminder,
      defaultHour:
        typeof raw.sceneReminder?.defaultHour === 'number' &&
        Number.isInteger(raw.sceneReminder.defaultHour) &&
        raw.sceneReminder.defaultHour >= 0 &&
        raw.sceneReminder.defaultHour <= 23
          ? raw.sceneReminder.defaultHour
          : DEFAULT_NOTIFICATION_SETTINGS.sceneReminder.defaultHour,
    },
    aiGeneratorsDone: { ...DEFAULT_NOTIFICATION_SETTINGS.aiGeneratorsDone, ...raw.aiGeneratorsDone },
    transferDone: { ...DEFAULT_NOTIFICATION_SETTINGS.transferDone, ...raw.transferDone },
  }
}

export function notificationSettingsNow(): NotificationSettings {
  return currentSettings
}

export async function loadNotificationSettings(db: SQLiteDatabase): Promise<NotificationSettings> {
  const raw = await getSetting(db, SETTINGS_KEY)
  if (!raw) {
    currentSettings = DEFAULT_NOTIFICATION_SETTINGS
    emitChange()
    return currentSettings
  }
  try {
    currentSettings = mergeSettings(JSON.parse(raw) as Partial<NotificationSettings>)
  } catch {
    currentSettings = DEFAULT_NOTIFICATION_SETTINGS
  }
  emitChange()
  return currentSettings
}

export async function saveNotificationSettings(db: SQLiteDatabase, next: NotificationSettings): Promise<NotificationSettings> {
  currentSettings = mergeSettings(next)
  emitChange()
  await setSetting(db, SETTINGS_KEY, JSON.stringify(currentSettings))
  return currentSettings
}

export function useNotificationSettings(): [NotificationSettings, (patch: Partial<NotificationSettings>) => Promise<void>] {
  const db = useDatabase()
  const settings = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => currentSettings
  )
  const update = useCallback(
    async (patch: Partial<NotificationSettings>) => {
      await saveNotificationSettings(db, { ...currentSettings, ...patch })
    },
    [db]
  )
  return [settings, update]
}

export function enabledNotificationCount(cfg: NotificationSettings): number {
  return NOTIFICATION_FEATURE_KEYS.filter((key) => cfg[key].enabled).length
}

export async function hasAskedNotificationPermission(db: SQLiteDatabase): Promise<boolean> {
  return (await getSetting(db, ASKED_PERMISSION_KEY)) === '1'
}

export async function markNotificationPermissionAsked(db: SQLiteDatabase): Promise<void> {
  await setSetting(db, ASKED_PERMISSION_KEY, '1')
}
