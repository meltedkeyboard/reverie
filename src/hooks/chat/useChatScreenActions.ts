import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'

import type { RowMessage } from '@/components/chat/MessageRow'
import { branchChat, deleteChat, getChat, type Chat } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { useTheme } from '@/theme'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chat/chatDialogs'
import { promptText, showMessage, showSheet } from '@/lib/ui/dialogs'
import type { MessageAction } from '@/lib/chat/messageActions'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { useNotifications } from '@/hooks/features/useNotifications'
import { formatWhen } from '@/lib/core/format'
import { scheduleSceneReminder } from '@/lib/notifications/events'
import { formatDelayLabel, scheduleDelayedFollowUp } from '@/lib/notifications/followUp'
import { showToast } from '@/lib/ui/toast'
import { alertError, reportError } from '@/lib/transfer/report'

type MessageActionHandlers = {
  regenerate: (id: number, guidance?: string) => void
  removeRefine: (id: number) => void
  removeVariant: (id: number) => void
  removeMessage: (id: number) => void
  edit: (message: RowMessage) => void
  branch: (id: number) => void
}

// What the menu on a message does, the same in a chat and in a scene.
export function useMessageActions({ regenerate, removeRefine, removeVariant, removeMessage, edit, branch }: MessageActionHandlers) {
  const { t } = useTranslation()
  // The chat's scheme over its background, which the system's alert would not take by itself.
  const { scheme } = useTheme()
  return useCallback(
    (message: RowMessage, action: MessageAction) => {
      const wish = message.refines[message.variant] ?? undefined
      if (action === 'copy') Clipboard.setStringAsync(message.content)
      else if (action === 'regenerate') regenerate(message.id)
      else if (action === 'refine' || action === 'editRefine') {
        promptText({
          title: t('chat.refineTitle'),
          message: t('chat.refineMessage'),
          initial: action === 'editRefine' ? wish : undefined,
          confirmLabel: t('chat.refineConfirm'),
          scheme,
          onSubmit: (text) => {
            if (text.trim()) regenerate(message.id, text)
          },
        })
      } else if (action === 'refineAgain') {
        if (wish) regenerate(message.id, wish)
      } else if (action === 'dropRefine') removeRefine(message.id)
      else if (action === 'deleteVariant') removeVariant(message.id)
      else if (action === 'edit') edit(message)
      else if (action === 'branch') branch(message.id)
      else removeMessage(message.id)
    },
    [regenerate, removeRefine, removeVariant, removeMessage, edit, branch, t, scheme]
  )
}

// A new chat that goes on from a message (branchChat), taken to at once: the chat it came
// from stays as it was.
export function useBranch(chatId: number, title: string | null, onShow: (chat: Chat) => void) {
  const db = useDatabase()
  const { t } = useTranslation()
  return useCallback(
    async (messageId: number) => {
      try {
        const id = await branchChat(db, chatId, messageId, title ? t('chat.branchTitle', { title }) : null)
        const chat = await getChat(db, id)
        if (chat) onShow(chat)
      } catch (err) {
        reportError(t('chat.branchFailed'), err)
      }
    },
    [db, chatId, title, onShow, t]
  )
}

type ChatMenuHandlers = {
  chatId: number
  title: string | null
  rename: (title: string | null) => Promise<void>
  autoName: () => Promise<string | null>
  discard: () => void
  // Where to go once the chat is deleted; back by default.
  onDeleted?: () => void
}

// The header menu's rename, title suggestion and delete, the same in a chat and in a scene.
export function useChatMenuActions({ chatId, title, rename, autoName, discard, onDeleted }: ChatMenuHandlers) {
  const db = useDatabase()
  const router = useRouter()
  const { t } = useTranslation()
  const { scheme } = useTheme()

  const confirmDelete = () => {
    confirmDeleteChat(async () => {
      discard()
      await deleteChat(db, chatId)
      if (onDeleted) onDeleted()
      else router.back()
    }, scheme)
  }

  const promptRename = () => promptRenameChat(title, rename, scheme)

  const suggestName = async () => {
    try {
      if (!(await autoName())) showMessage(t('chat.titleNotFoundTitle'), t('chat.titleNotFoundMessage'))
    } catch (err) {
      alertError(t('chat.titleFailedTitle'), err)
    }
  }

  return { confirmDelete, promptRename, suggestName }
}

const DELAY_CHOICES = [15, 60, 180, 480] as const

export function useDelayedFollowUpMenu(opts: {
  chatId: number
  characterId: number | null
  senderName: string
  systemPrompt: string
  avatarFile: string | null
  roomTitle?: string
  disabled?: boolean
}): MenuItem[] {
  const db = useDatabase()
  const { t } = useTranslation()
  const { scheme } = useTheme()
  const { available, settings } = useNotifications()

  if (opts.disabled || !available || !settings.enabled || !settings.delayedCharacterMessage.enabled) {
    return []
  }

  const pick = (delayMinutes: number) => {
    scheduleDelayedFollowUp(db, {
      chatId: opts.chatId,
      characterId: opts.characterId,
      senderName: opts.senderName,
      systemPrompt: opts.systemPrompt,
      avatarFile: opts.avatarFile,
      roomTitle: opts.roomTitle,
      delayMinutes,
    })
      .then((ok) => {
        if (ok) {
          showToast({
            tone: 'success',
            title: t('notifications.delayedScheduled', {
              name: opts.senderName,
              delay: formatDelayLabel(delayMinutes),
            }),
          })
        }
      })
      .catch((err) => reportError(t('notifications.delayedTitle'), err))
  }

  const defaultDelay = settings.delayedCharacterMessage.delayMinutes
  const ordered = [defaultDelay, ...DELAY_CHOICES.filter((m) => m !== defaultDelay)]

  return [
    {
      label: t('notifications.delayedMenu'),
      systemImage: 'clock.badge',
      onSelect: () => {
        showSheet(
          t('notifications.delayedMenu'),
          ordered.map((mins) => ({
            label: formatDelayLabel(mins),
            onSelect: () => pick(mins),
          })),
          { scheme }
        )
      },
    },
  ]
}

export function useSceneReminderMenu(opts: {
  chatId: number
  name: string
  avatarFile?: string | null
  isGroup?: boolean
  disabled?: boolean
}): MenuItem[] {
  const { t, locale } = useTranslation()
  const { scheme } = useTheme()
  const { available, settings } = useNotifications()

  if (opts.disabled || !available || !settings.enabled || !settings.sceneReminder.enabled) {
    return []
  }

  const scheduleAt = (fireAtMs: number) => {
    scheduleSceneReminder({
      chatId: opts.chatId,
      name: opts.name,
      avatarFile: opts.avatarFile,
      isGroup: opts.isGroup,
      fireAtMs,
    })
      .then((ok) => {
        if (ok) {
          showToast({
            tone: 'success',
            title: t('notifications.reminderScheduled', { when: formatWhen(fireAtMs, locale) }),
          })
        }
      })
      .catch((err) => reportError(t('notifications.reminderTitle'), err))
  }

  const openChoices = () => {
    const now = new Date()
    const hour = settings.sceneReminder.defaultHour
    const tonight = new Date(now)
    tonight.setHours(hour, 0, 0, 0)
    if (tonight.getTime() <= now.getTime() + 15 * 60 * 1000) {
      tonight.setDate(tonight.getDate() + 1)
    }
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)

    const items: MenuItem[] = [
      { label: t('notifications.reminderIn1h'), onSelect: () => scheduleAt(Date.now() + 60 * 60 * 1000) },
      { label: t('notifications.reminderTonight', { hour }), onSelect: () => scheduleAt(tonight.getTime()) },
      { label: t('notifications.reminderTomorrow'), onSelect: () => scheduleAt(tomorrow.getTime()) },
      {
        label: t('notifications.reminderCustom'),
        onSelect: () => {
          promptText({
            title: t('notifications.reminderCustomTitle'),
            message: t('notifications.reminderCustomPlaceholder'),
            initial: '2',
            confirmLabel: t('common.ok'),
            scheme,
            onSubmit: (raw) => {
              const hours = Number(raw.replace(',', '.').trim())
              if (Number.isFinite(hours) && hours > 0 && hours <= 168) {
                scheduleAt(Date.now() + hours * 60 * 60 * 1000)
              }
            },
          })
        },
      },
    ]

    showSheet(t('notifications.reminderMenu'), items, { scheme })
  }

  return [
    {
      label: t('notifications.reminderMenu'),
      systemImage: 'bell.badge',
      onSelect: openChoices,
    },
  ]
}
