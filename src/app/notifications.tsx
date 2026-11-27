import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { AppState, ScrollView, StyleSheet, View } from 'react-native'

import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { ButtonCell, ListSection, SegmentCell, SwitchCell, ValueCell } from '@/components/lists/GroupedList'
import {
  nativeForm,
  NativeActionRow,
  NativeForm,
  NativePickerRow,
  NativeSection,
  NativeSegmentRow,
} from '@/components/lists/NativeForm'
import {
  type AvatarNotificationStyle,
  type NotificationPreviewMode,
} from '@/db/prefs/notifications'
import { useNotifications } from '@/hooks/features/useNotifications'
import { useTranslation } from '@/i18n'
import { isAndroid } from '@/lib/core/platform'
import {
  notifyLocal,
  openNotificationSystemSettings,
} from '@/lib/notifications/service'
import * as Haptics from '@/lib/ui/haptics'
import { showToast } from '@/lib/ui/toast'
import { type Colors, useStyles } from '@/theme'

const MIN_SEC_OPTIONS: (0 | 5 | 15 | 30)[] = [0, 5, 15, 30]
const DELAY_MIN_OPTIONS: (15 | 60 | 180 | 480)[] = [15, 60, 180, 480]
const REMINDER_HOUR_OPTIONS: (9 | 12 | 18 | 21)[] = [9, 12, 18, 21]

export default function NotificationsScreen() {
  const router = useRouter()
  const padding = useScreenPadding('form')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { permission, settings, updateSettings, refreshPermission, requestPermission } = useNotifications()
  const [testing, setTesting] = useState(false)

  useFocusEffect(
    useCallback(() => {
      refreshPermission()
    }, [refreshPermission])
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission()
    })
    return () => sub.remove()
  }, [refreshPermission])

  const permissionLabel =
    permission === 'granted'
      ? t('notifications.permissionGranted')
      : permission === 'denied'
        ? t('notifications.permissionDenied')
        : t('notifications.permissionUndetermined')

  const previewOptions: { value: NotificationPreviewMode; label: string }[] = [
    { value: 'full', label: t('notifications.previewFull') },
    { value: 'nameOnly', label: t('notifications.previewNameOnly') },
    { value: 'hidden', label: t('notifications.previewHidden') },
  ]

  const minSecOptions = MIN_SEC_OPTIONS.map((v) => ({
    value: String(v),
    label: v === 0 ? t('notifications.replyReadyAlways') : t('notifications.replyReadySec', { count: v }),
  }))

  const avatarStyleOptions: { value: AvatarNotificationStyle; label: string }[] = [
    { value: 'communication', label: t('notifications.avatarCommunication') },
    { value: 'attachment', label: t('notifications.avatarAttachment') },
  ]

  const delayOptions = DELAY_MIN_OPTIONS.map((v) => ({
    value: String(v),
    label:
      v === 15
        ? t('notifications.delay15m')
        : v === 60
          ? t('notifications.delay1h')
          : v === 180
            ? t('notifications.delay3h')
            : t('notifications.delay8h'),
  }))

  const hourOptions = REMINDER_HOUR_OPTIONS.map((v) => ({
    value: String(v),
    label: `${String(v).padStart(2, '0')}:00`,
  }))

  const onAskPermission = async () => {
    Haptics.selectionAsync()
    const next = await requestPermission()
    if (next === 'denied') await openNotificationSystemSettings()
  }

  const onSendTest = async () => {
    setTesting(true)
    try {
      let status = permission
      if (status === 'undetermined') {
        status = await requestPermission()
      }
      if (status !== 'granted') {
        await openNotificationSystemSettings()
        return
      }
      const sent = await notifyLocal({
        id: `test:${Date.now()}`,
        tag: 'test',
        title: t('notifications.testTitle'),
        body: t('notifications.testBody'),
        channel: 'replies',
        category: 'default',
        route: '/notifications',
        presentInForeground: true,
      })
      if (sent) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        showToast({ tone: 'success', title: t('notifications.testSent') })
      }
    } finally {
      setTesting(false)
    }
  }

  const featuresVisible = settings.enabled

  const renderNative = ({ ui }: NonNullable<typeof nativeForm>) => {
    const { Toggle, LabeledContent, Text: SwiftText } = ui
    const toggle = (label: string, isOn: boolean, onChange: (on: boolean) => void) => (
      <Toggle label={label} isOn={isOn} onIsOnChange={onChange} />
    )
    return (
      <NativeForm>
        <NativeSection title={t('notifications.permissionSection')}>
          <LabeledContent label={t('notifications.permissionStatus')}>
            <SwiftText>{permissionLabel}</SwiftText>
          </LabeledContent>
          {permission === 'undetermined' ? (
            <NativeActionRow label={t('notifications.requestPermission')} symbol="bell.badge" onPress={onAskPermission} />
          ) : permission === 'denied' ? (
            <NativeActionRow label={t('notifications.openSystemSettings')} symbol="gear" onPress={() => openNotificationSystemSettings()} />
          ) : null}
          <NativeActionRow label={t('notifications.testButton')} symbol="paperplane" busy={testing} onPress={onSendTest} />
        </NativeSection>

        <NativeSection title={t('notifications.generalSection')} footer={t('notifications.generalFooter')}>
          {toggle(t('notifications.masterEnable'), settings.enabled, (enabled) => updateSettings({ enabled }))}
          {featuresVisible ? (
            <>
              {toggle(t('notifications.sound'), settings.sound, (sound) => updateSettings({ sound }))}
              {toggle(t('notifications.muteActiveChat'), settings.muteActiveChat, (muteActiveChat) => updateSettings({ muteActiveChat }))}
              <NativeSegmentRow
                label={t('notifications.previewLabel')}
                options={previewOptions}
                value={settings.preview}
                onChange={(preview) => {
                  Haptics.selectionAsync()
                  updateSettings({ preview })
                }}
              />
            </>
          ) : null}
        </NativeSection>

        {featuresVisible ? (
          <>
            <NativeSection title={t('notifications.replyReadyTitle')} footer={t('notifications.replyReadyFooter')}>
              {toggle(t('notifications.replyReadyEnable'), settings.replyReady.enabled, (enabled) =>
                updateSettings({ replyReady: { ...settings.replyReady, enabled } })
              )}
              {settings.replyReady.enabled ? (
                <>
                  <NativePickerRow
                    label={t('notifications.replyReadyMinDelay')}
                    value={String(settings.replyReady.minSeconds)}
                    options={minSecOptions}
                    onChange={(v) => updateSettings({ replyReady: { ...settings.replyReady, minSeconds: Number(v) as 0 | 5 | 15 | 30 } })}
                  />
                  {toggle(t('notifications.replyReadySnippet'), settings.replyReady.showSnippet, (showSnippet) =>
                    updateSettings({ replyReady: { ...settings.replyReady, showSnippet } })
                  )}
                </>
              ) : null}
            </NativeSection>

            <NativeSection title={t('notifications.roomAutoplayTitle')} footer={t('notifications.roomAutoplayFooter')}>
              {toggle(t('notifications.roomAutoplayEnable'), settings.roomAutoplayDone.enabled, (enabled) =>
                updateSettings({ roomAutoplayDone: { ...settings.roomAutoplayDone, enabled } })
              )}
              {settings.roomAutoplayDone.enabled
                ? toggle(t('notifications.roomAutoplayOnlyAuto'), settings.roomAutoplayDone.onlyAutoplay, (onlyAutoplay) =>
                    updateSettings({ roomAutoplayDone: { ...settings.roomAutoplayDone, onlyAutoplay } })
                  )
                : null}
            </NativeSection>

            <NativeSection title={t('notifications.avatarTitle')} footer={t('notifications.avatarFooter')}>
              {toggle(t('notifications.avatarEnable'), settings.characterAvatar.enabled, (enabled) =>
                updateSettings({ characterAvatar: { ...settings.characterAvatar, enabled } })
              )}
              {settings.characterAvatar.enabled ? (
                <NativeSegmentRow
                  label={t('notifications.avatarStyle')}
                  options={avatarStyleOptions}
                  value={settings.characterAvatar.style}
                  onChange={(style) => {
                    Haptics.selectionAsync()
                    updateSettings({ characterAvatar: { ...settings.characterAvatar, style } })
                  }}
                />
              ) : null}
            </NativeSection>

            <NativeSection title={t('notifications.inlineTitle')} footer={t('notifications.inlineFooter')}>
              {toggle(t('notifications.inlineEnable'), settings.inlineReply.enabled, (enabled) =>
                updateSettings({ inlineReply: { ...settings.inlineReply, enabled } })
              )}
              {settings.inlineReply.enabled
                ? toggle(t('notifications.inlineContinue'), settings.inlineReply.allowContinue, (allowContinue) =>
                    updateSettings({ inlineReply: { ...settings.inlineReply, allowContinue } })
                  )
                : null}
            </NativeSection>

            <NativeSection title={t('notifications.errorTitle')} footer={t('notifications.errorFooter')}>
              {toggle(t('notifications.errorEnable'), settings.streamInterrupted.enabled, (enabled) =>
                updateSettings({ streamInterrupted: { ...settings.streamInterrupted, enabled } })
              )}
              {settings.streamInterrupted.enabled
                ? toggle(t('notifications.errorReason'), settings.streamInterrupted.includeReason, (includeReason) =>
                    updateSettings({ streamInterrupted: { ...settings.streamInterrupted, includeReason } })
                  )
                : null}
            </NativeSection>

            <NativeSection title={t('notifications.delayedTitle')} footer={t('notifications.delayedFooter')}>
              {toggle(t('notifications.delayedEnable'), settings.delayedCharacterMessage.enabled, (enabled) =>
                updateSettings({ delayedCharacterMessage: { ...settings.delayedCharacterMessage, enabled } })
              )}
              {settings.delayedCharacterMessage.enabled ? (
                <>
                  <NativeSegmentRow
                    label={t('notifications.delayedDelay')}
                    options={delayOptions}
                    value={String(settings.delayedCharacterMessage.delayMinutes)}
                    onChange={(v) => {
                      Haptics.selectionAsync()
                      updateSettings({
                        delayedCharacterMessage: {
                          ...settings.delayedCharacterMessage,
                          delayMinutes: Number(v) as 15 | 60 | 180 | 480,
                        },
                      })
                    }}
                  />
                  {toggle(t('notifications.delayedAutoGen'), settings.delayedCharacterMessage.autoGenerate, (autoGenerate) =>
                    updateSettings({ delayedCharacterMessage: { ...settings.delayedCharacterMessage, autoGenerate } })
                  )}
                </>
              ) : null}
            </NativeSection>

            <NativeSection title={t('notifications.reminderTitle')} footer={t('notifications.reminderFooter')}>
              {toggle(t('notifications.reminderEnable'), settings.sceneReminder.enabled, (enabled) =>
                updateSettings({ sceneReminder: { ...settings.sceneReminder, enabled } })
              )}
              {settings.sceneReminder.enabled ? (
                <NativeSegmentRow
                  label={t('notifications.reminderHour')}
                  options={hourOptions}
                  value={String(settings.sceneReminder.defaultHour)}
                  onChange={(v) => {
                    Haptics.selectionAsync()
                    updateSettings({ sceneReminder: { ...settings.sceneReminder, defaultHour: Number(v) as 9 | 12 | 18 | 21 } })
                  }}
                />
              ) : null}
            </NativeSection>

            <NativeSection title={t('notifications.generatorsTitle')} footer={t('notifications.generatorsFooter')}>
              {toggle(t('notifications.generatorsEnable'), settings.aiGeneratorsDone.enabled, (enabled) =>
                updateSettings({ aiGeneratorsDone: { ...settings.aiGeneratorsDone, enabled } })
              )}
              {settings.aiGeneratorsDone.enabled
                ? toggle(t('notifications.generatorsMemory'), settings.aiGeneratorsDone.includeMemory, (includeMemory) =>
                    updateSettings({ aiGeneratorsDone: { ...settings.aiGeneratorsDone, includeMemory } })
                  )
                : null}
            </NativeSection>

            <NativeSection title={t('notifications.transferTitle')} footer={t('notifications.transferFooter')}>
              {toggle(t('notifications.transferEnable'), settings.transferDone.enabled, (enabled) =>
                updateSettings({ transferDone: { ...settings.transferDone, enabled } })
              )}
              {settings.transferDone.enabled ? (
                <>
                  {toggle(t('notifications.transferSuccess'), settings.transferDone.notifySuccess, (notifySuccess) =>
                    updateSettings({ transferDone: { ...settings.transferDone, notifySuccess } })
                  )}
                  {toggle(t('notifications.transferFailure'), settings.transferDone.notifyFailure, (notifyFailure) =>
                    updateSettings({ transferDone: { ...settings.transferDone, notifyFailure } })
                  )}
                </>
              ) : null}
            </NativeSection>
          </>
        ) : null}
      </NativeForm>
    )
  }

  return (
    <View style={styles.screen}>
      {nativeForm ? (
        renderNative(nativeForm)
      ) : (
        <ScrollView contentContainerStyle={padding}>
          <ListSection header={t('notifications.permissionSection')}>
            <ValueCell label={t('notifications.permissionStatus')} value={permissionLabel} />
            {permission === 'undetermined' ? (
              <ButtonCell
                label={t('notifications.requestPermission')}
                icon={{ symbol: 'bell.badge', fallback: 'notifications-outline' }}
                onPress={onAskPermission}
              />
            ) : permission === 'denied' ? (
              <ButtonCell
                label={t('notifications.openSystemSettings')}
                icon={{ symbol: 'gear', fallback: 'settings-outline' }}
                onPress={() => openNotificationSystemSettings()}
              />
            ) : null}
            <ButtonCell
              label={t('notifications.testButton')}
              icon={{ symbol: 'paperplane', fallback: 'paper-plane-outline' }}
              loading={testing}
              onPress={onSendTest}
            />
          </ListSection>

          <ListSection header={t('notifications.generalSection')} footer={t('notifications.generalFooter')}>
            <SwitchCell
              label={t('notifications.masterEnable')}
              value={settings.enabled}
              onValueChange={(enabled) => updateSettings({ enabled })}
            />
            {featuresVisible ? (
              <>
                <SwitchCell
                  label={t('notifications.sound')}
                  value={settings.sound}
                  onValueChange={(sound) => updateSettings({ sound })}
                />
                <SwitchCell
                  label={t('notifications.muteActiveChat')}
                  value={settings.muteActiveChat}
                  onValueChange={(muteActiveChat) => updateSettings({ muteActiveChat })}
                />
                <SegmentCell
                  label={t('notifications.previewLabel')}
                  options={previewOptions}
                  value={settings.preview}
                  onChange={(preview) => {
                    Haptics.selectionAsync()
                    updateSettings({ preview })
                  }}
                />
              </>
            ) : null}
          </ListSection>

          {featuresVisible ? (
            <>
              <ListSection header={t('notifications.replyReadyTitle')} footer={t('notifications.replyReadyFooter')}>
                <SwitchCell
                  label={t('notifications.replyReadyEnable')}
                  value={settings.replyReady.enabled}
                  onValueChange={(enabled) => updateSettings({ replyReady: { ...settings.replyReady, enabled } })}
                />
                {settings.replyReady.enabled ? (
                  <>
                    <SegmentCell
                      label={t('notifications.replyReadyMinDelay')}
                      options={minSecOptions}
                      value={String(settings.replyReady.minSeconds)}
                      onChange={(v) => {
                        Haptics.selectionAsync()
                        updateSettings({ replyReady: { ...settings.replyReady, minSeconds: Number(v) as 0 | 5 | 15 | 30 } })
                      }}
                    />
                    <SwitchCell
                      label={t('notifications.replyReadySnippet')}
                      value={settings.replyReady.showSnippet}
                      onValueChange={(showSnippet) => updateSettings({ replyReady: { ...settings.replyReady, showSnippet } })}
                    />
                  </>
                ) : null}
              </ListSection>

              <ListSection header={t('notifications.roomAutoplayTitle')} footer={t('notifications.roomAutoplayFooter')}>
                <SwitchCell
                  label={t('notifications.roomAutoplayEnable')}
                  value={settings.roomAutoplayDone.enabled}
                  onValueChange={(enabled) => updateSettings({ roomAutoplayDone: { ...settings.roomAutoplayDone, enabled } })}
                />
                {settings.roomAutoplayDone.enabled ? (
                  <SwitchCell
                    label={t('notifications.roomAutoplayOnlyAuto')}
                    value={settings.roomAutoplayDone.onlyAutoplay}
                    onValueChange={(onlyAutoplay) => updateSettings({ roomAutoplayDone: { ...settings.roomAutoplayDone, onlyAutoplay } })}
                  />
                ) : null}
              </ListSection>

              <ListSection header={t('notifications.avatarTitle')} footer={t('notifications.avatarFooter')}>
                <SwitchCell
                  label={t('notifications.avatarEnable')}
                  value={settings.characterAvatar.enabled}
                  onValueChange={(enabled) => updateSettings({ characterAvatar: { ...settings.characterAvatar, enabled } })}
                />
                {settings.characterAvatar.enabled ? (
                  <SegmentCell
                    label={t('notifications.avatarStyle')}
                    options={avatarStyleOptions}
                    value={settings.characterAvatar.style}
                    onChange={(style) => {
                      Haptics.selectionAsync()
                      updateSettings({ characterAvatar: { ...settings.characterAvatar, style } })
                    }}
                  />
                ) : null}
              </ListSection>

              <ListSection header={t('notifications.inlineTitle')} footer={t('notifications.inlineFooter')}>
                <SwitchCell
                  label={t('notifications.inlineEnable')}
                  value={settings.inlineReply.enabled}
                  onValueChange={(enabled) => updateSettings({ inlineReply: { ...settings.inlineReply, enabled } })}
                />
                {settings.inlineReply.enabled ? (
                  <SwitchCell
                    label={t('notifications.inlineContinue')}
                    value={settings.inlineReply.allowContinue}
                    onValueChange={(allowContinue) => updateSettings({ inlineReply: { ...settings.inlineReply, allowContinue } })}
                  />
                ) : null}
              </ListSection>

              <ListSection header={t('notifications.errorTitle')} footer={t('notifications.errorFooter')}>
                <SwitchCell
                  label={t('notifications.errorEnable')}
                  value={settings.streamInterrupted.enabled}
                  onValueChange={(enabled) => updateSettings({ streamInterrupted: { ...settings.streamInterrupted, enabled } })}
                />
                {settings.streamInterrupted.enabled ? (
                  <SwitchCell
                    label={t('notifications.errorReason')}
                    value={settings.streamInterrupted.includeReason}
                    onValueChange={(includeReason) => updateSettings({ streamInterrupted: { ...settings.streamInterrupted, includeReason } })}
                  />
                ) : null}
              </ListSection>

              <ListSection header={t('notifications.delayedTitle')} footer={t('notifications.delayedFooter')}>
                <SwitchCell
                  label={t('notifications.delayedEnable')}
                  value={settings.delayedCharacterMessage.enabled}
                  onValueChange={(enabled) =>
                    updateSettings({ delayedCharacterMessage: { ...settings.delayedCharacterMessage, enabled } })
                  }
                />
                {settings.delayedCharacterMessage.enabled ? (
                  <>
                    <SegmentCell
                      label={t('notifications.delayedDelay')}
                      options={delayOptions}
                      value={String(settings.delayedCharacterMessage.delayMinutes)}
                      onChange={(v) => {
                        Haptics.selectionAsync()
                        updateSettings({
                          delayedCharacterMessage: {
                            ...settings.delayedCharacterMessage,
                            delayMinutes: Number(v) as 15 | 60 | 180 | 480,
                          },
                        })
                      }}
                    />
                    <SwitchCell
                      label={t('notifications.delayedAutoGen')}
                      value={settings.delayedCharacterMessage.autoGenerate}
                      onValueChange={(autoGenerate) =>
                        updateSettings({ delayedCharacterMessage: { ...settings.delayedCharacterMessage, autoGenerate } })
                      }
                    />
                  </>
                ) : null}
              </ListSection>

              <ListSection header={t('notifications.reminderTitle')} footer={t('notifications.reminderFooter')}>
                <SwitchCell
                  label={t('notifications.reminderEnable')}
                  value={settings.sceneReminder.enabled}
                  onValueChange={(enabled) => updateSettings({ sceneReminder: { ...settings.sceneReminder, enabled } })}
                />
                {settings.sceneReminder.enabled ? (
                  <SegmentCell
                    label={t('notifications.reminderHour')}
                    options={hourOptions}
                    value={String(settings.sceneReminder.defaultHour)}
                    onChange={(v) => {
                      Haptics.selectionAsync()
                      updateSettings({
                        sceneReminder: { ...settings.sceneReminder, defaultHour: Number(v) as 9 | 12 | 18 | 21 },
                      })
                    }}
                  />
                ) : null}
              </ListSection>

              <ListSection header={t('notifications.generatorsTitle')} footer={t('notifications.generatorsFooter')}>
                <SwitchCell
                  label={t('notifications.generatorsEnable')}
                  value={settings.aiGeneratorsDone.enabled}
                  onValueChange={(enabled) => updateSettings({ aiGeneratorsDone: { ...settings.aiGeneratorsDone, enabled } })}
                />
                {settings.aiGeneratorsDone.enabled ? (
                  <SwitchCell
                    label={t('notifications.generatorsMemory')}
                    value={settings.aiGeneratorsDone.includeMemory}
                    onValueChange={(includeMemory) =>
                      updateSettings({ aiGeneratorsDone: { ...settings.aiGeneratorsDone, includeMemory } })
                    }
                  />
                ) : null}
              </ListSection>

              <ListSection header={t('notifications.transferTitle')} footer={t('notifications.transferFooter')}>
                <SwitchCell
                  label={t('notifications.transferEnable')}
                  value={settings.transferDone.enabled}
                  onValueChange={(enabled) => updateSettings({ transferDone: { ...settings.transferDone, enabled } })}
                />
                {settings.transferDone.enabled ? (
                  <>
                    <SwitchCell
                      label={t('notifications.transferSuccess')}
                      value={settings.transferDone.notifySuccess}
                      onValueChange={(notifySuccess) => updateSettings({ transferDone: { ...settings.transferDone, notifySuccess } })}
                    />
                    <SwitchCell
                      label={t('notifications.transferFailure')}
                      value={settings.transferDone.notifyFailure}
                      onValueChange={(notifyFailure) => updateSettings({ transferDone: { ...settings.transferDone, notifyFailure } })}
                    />
                  </>
                ) : null}
              </ListSection>
            </>
          ) : null}
        </ScrollView>
      )}
      {isAndroid ? (
        <GlassHeader
          floating
          centerTitle
          left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />}
        >
          <TabTitle star={false}>{t('notifications.title')}</TabTitle>
        </GlassHeader>
      ) : (
        <FormScreenHeader title={t('notifications.title')} />
      )}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
  })
