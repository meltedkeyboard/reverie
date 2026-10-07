import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'

import { ButtonCell, CheckCell, InputCell, LinkCell, ListFooter, ListSection, MenuCell, SliderCell, SwitchCell } from '@/components/lists/GroupedList'
import { loadModel } from '@/api/llm'
import { Flash } from '@/components/overlays/Flash'
import { GlassHeader, TabTitle, useHeaderHeight, useScreenPadding } from '@/components/chrome/GlassHeader'
import { isAppLockEnabled, setAppLockEnabled } from '@/db/prefs/appLock'
import { isConfirmDeleteEnabled, setConfirmDeleteEnabled } from '@/db/prefs/confirmDelete'
import { isContinueByVisit, isContinueEnabled, setContinueByVisit, setContinueEnabled } from '@/db/prefs/continue'
import { getFileLimits } from '@/lib/settings/fileLimits'
import { loadFileLimits, setAttachmentLimitMb, setAvatarLimitMb, setLimitsOff } from '@/db/prefs/fileLimits'
import { isHapticsEnabled, setHapticsEnabled } from '@/db/prefs/haptics'
import {
  isRecentAttachmentsEnabled,
  loadRecentSettings,
  setRecentAttachmentsEnabled,
  setRecentCount,
  setRecentUnlimited,
  type RecentSettings,
  DEFAULT_RECENT_COUNT,
} from '@/db/recentAttachments'
import { isPrivateChatEnabled, setPrivateChatEnabled } from '@/db/prefs/privateChat'
import { useDatabase, useShowInFiles } from '@/db/provider'
import { DEFAULT_SETTINGS, saveSettings, typedCount } from '@/db/prefs/settings'
import { isSuggestionsEnabled, setSuggestionsEnabled } from '@/db/prefs/suggestions'
import { useCloudSync } from '@/hooks/features/useCloudSync'
import { useServerForm } from '@/hooks/features/useServerForm'
import { useStoredFlag } from '@/hooks/util/useStoredFlag'
import { useTranslation, type LocalePreference } from '@/i18n'
import { CONTEXT_STEPS, type ContextMode } from '@/lib/core/context'
import { BackupTreeSheet } from '@/components/overlays/BackupTreeSheet'
import { exportBackup, importBackup, loadBackupTree, readBackup, wipeAllData, type OpenedBackup } from '@/lib/transfer/backup'
import type { BackupTree, Selection } from '@/lib/transfer/backupSelection'
import { alternateIconsAvailable, currentAppIcon } from '@/lib/settings/appIcons'
import { confirm } from '@/lib/ui/dialogs'
import { showToast } from '@/lib/ui/toast'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { formatWhen } from '@/lib/core/format'
import { notificationAsync, NotificationFeedbackType } from '@/lib/ui/haptics'
import type { SettingsSection } from '@/lib/core/searchScope'
import { isShownInFiles } from '@/lib/core/storage'
import { reportError } from '@/lib/transfer/report'
import { isAndroid } from '@/lib/core/platform'
import { type Colors, useStyles } from '@/theme'


export default function SettingsScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const styles = useStyles(createStyles)
  const { t, locale, preference: localePreference, setPreference: setLocalePreference } = useTranslation()
  const headerHeight = useHeaderHeight()
  const { section } = useLocalSearchParams<{ section?: SettingsSection }>()
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null)
  // Where each section starts in the scroll content, filled in as they are laid out.
  const offsets = useRef<Partial<Record<SettingsSection, number>>>({})
  // `n` tells two jumps to the same section apart, so the tint plays again.
  const [flashed, setFlashed] = useState<{ section: SettingsSection; n: number } | null>(null)

  // Runs when the parameter arrives and again as sections are laid out, since on the
  // first visit the one asked for may not have been measured yet. The parameter is
  // cleared afterwards, so asking for the same section again scrolls once more.
  const jump = useCallback(() => {
    const y = section && offsets.current[section]
    if (!section || y === undefined) return
    scrollRef.current?.scrollTo({ y: Math.max(0, y - headerHeight - 16), animated: true })
    setFlashed((prev) => ({ section, n: (prev?.n ?? 0) + 1 }))
    router.setParams({ section: undefined })
  }, [section, headerHeight, router])

  useEffect(() => {
    jump()
  }, [jump])

  // A part of the page a search result can open at.
  const block = (id: SettingsSection, children: React.ReactNode, style?: object) => (
    <View
      style={style}
      onLayout={(e) => {
        offsets.current[id] = e.nativeEvent.layout.y
        if (id === section) jump()
      }}
    >
      {flashed?.section === id ? <Flash key={flashed.n} style={styles.flash} /> : null}
      {children}
    </View>
  )

  const CONTEXT_OPTIONS: { value: ContextMode; label: string }[] = [
    { value: 'messages', label: t('settings.contextMessages') },
    { value: 'tokens', label: t('settings.contextTokens') },
  ]
  const CONTINUE_OPTIONS: { value: 'visit' | 'message'; label: string }[] = [
    { value: 'visit', label: t('settings.continueByVisit') },
    { value: 'message', label: t('settings.continueByMessage') },
  ]
  const LANGUAGE_OPTIONS: { value: LocalePreference; label: string }[] = [
    { value: 'system', label: t('language.system') },
    { value: 'ru', label: t('language.ru') },
    { value: 'en', label: t('language.en') },
  ]

  // The context slider shows once the model is loaded; another server or model starts over.
  const [loadingModel, setLoadingModel] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const { cfg, setCfg, loaded, update, status, models, modelItems, onTest } = useServerForm(() => setModelLoaded(false))
  // What is typed in the message-count fields: it may be empty on the way to a new number.
  const [messageDrafts, setMessageDrafts] = useState<{ chatMessages?: string; roomMessages?: string }>({})
  const setMessages = (field: 'chatMessages' | 'roomMessages', text: string) => {
    const { digits, count } = typedCount(text)
    setMessageDrafts((d) => ({ ...d, [field]: digits }))
    if (count) update({ [field]: count })
  }
  // The size limits: the numbers may be empty while being retyped, a number below 1 is not kept.
  const [limits, setLimits] = useState(getFileLimits)
  const [limitDrafts, setLimitDrafts] = useState<{ avatarMb?: string; attachmentMb?: string }>({})
  useEffect(() => {
    loadFileLimits(db).then(setLimits)
  }, [db])
  const typeLimit = (field: 'avatarMb' | 'attachmentMb', text: string) => {
    const { digits, count } = typedCount(text)
    setLimitDrafts((d) => ({ ...d, [field]: digits }))
    if (!count) return
    setLimits((l) => ({ ...l, [field]: count }))
    if (field === 'avatarMb') setAvatarLimitMb(db, count)
    else setAttachmentLimitMb(db, count)
  }
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const backingUp = exporting || importing
  const [wiping, setWiping] = useState(false)
  const [continueButton, toggleContinueButton] = useStoredFlag(isContinueEnabled, setContinueEnabled, true)
  const [continueByVisit, setContinueByVisitValue] = useStoredFlag(isContinueByVisit, setContinueByVisit, true)
  const [privateButton, togglePrivateButton] = useStoredFlag(isPrivateChatEnabled, setPrivateChatEnabled, true)
  const [suggestions, toggleSuggestions] = useStoredFlag(isSuggestionsEnabled, setSuggestionsEnabled, false)
  const [recentPictures, toggleRecentPictures] = useStoredFlag(isRecentAttachmentsEnabled, setRecentAttachmentsEnabled, true)
  // How many of them: a number that may be empty while retyped, or no limit.
  const [recent, setRecent] = useState<RecentSettings>({ count: DEFAULT_RECENT_COUNT, unlimited: false })
  const [recentDraft, setRecentDraft] = useState<string>()
  useEffect(() => {
    loadRecentSettings(db).then(setRecent)
  }, [db])
  const typeRecentCount = (text: string) => {
    const { digits, count } = typedCount(text)
    setRecentDraft(digits)
    if (!count) return
    setRecent((r) => ({ ...r, count }))
    setRecentCount(db, count)
  }
  const [confirmDelete, toggleConfirmDelete] = useStoredFlag(isConfirmDeleteEnabled, setConfirmDeleteEnabled, true)
  const [haptics, toggleHaptics] = useStoredFlag(isHapticsEnabled, setHapticsEnabled, true)
  const [appLock, setAppLock] = useStoredFlag(isAppLockEnabled, setAppLockEnabled, false)

  const [showInFiles, setShowInFiles] = useState(isShownInFiles)
  const [movingFiles, setMovingFiles] = useState(false)
  const moveFiles = useShowInFiles()

  // The data moves right away: the database is copied, reopened from the new place, and
  // every screen reloads from it. The row is disabled while that runs.
  const toggleShowInFiles = async (shown: boolean) => {
    setShowInFiles(shown)
    setMovingFiles(true)
    try {
      await moveFiles(shown)
    } catch (err) {
      setShowInFiles(isShownInFiles())
      reportError(t('settings.showInFilesFailedTitle'), err)
    } finally {
      setMovingFiles(false)
    }
  }

  const cloudSync = useCloudSync()
  // Expo Go has no sync module. In development the section is still shown there, with
  // its buttons out and pretending to work, so the layout and animations can be looked at.
  const cloudPreview = __DEV__ && !cloudSync.available

  const toggleCloudSync = async (on: boolean) => {
    try {
      if (on) await cloudSync.enable()
      else await cloudSync.disable()
    } catch (err) {
      reportError(t('sync.failedTitle'), err)
    }
  }

  // Which of the two buttons shows the spinner; a quiet sync only dims both.
  const [cloudAction, setCloudAction] = useState<'push' | 'pull' | null>(null)
  const runCloud = async (action: 'push' | 'pull', run: () => Promise<void>) => {
    setCloudAction(action)
    try {
      if (cloudPreview) await new Promise((resolve) => setTimeout(resolve, 3000))
      else await run()
    } finally {
      setCloudAction(null)
    }
  }

  const cloudStatus = [
    cloudSync.folder ? t('settings.folderSyncFolder', { folder: cloudSync.folder }) : t('settings.folderSyncNoFolder'),
    cloudSync.syncedAt ? t('settings.folderSyncSyncedAt', { when: formatWhen(cloudSync.syncedAt, locale) }) : null,
  ]
    .filter(Boolean)
    .join('\n')

  const toggleAppLock = async (enabled: boolean) => {
    if (enabled) {
      // Verify it works before turning it on, so the app can't lock the user out.
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
        showToast({
          tone: 'error',
          title: t(isAndroid ? 'settings.requireBiometrics' : 'settings.requireFaceId'),
          message: t(`settings.${isAndroid ? 'biometricsUnavailable' : 'faceIdUnavailable'}`),
        })
        return
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })
      if (!result.success) return
    }
    setAppLock(enabled)
  }

  useEffect(() => {
    if (loaded) saveSettings(db, cfg)
  }, [db, cfg, loaded])

  const onLoadModel = async () => {
    setLoadingModel(true)
    try {
      await loadModel(cfg)
      setModelLoaded(true)
      notificationAsync(NotificationFeedbackType.Success)
    } catch (err) {
      notificationAsync(NotificationFeedbackType.Error)
      reportError(t('settings.loadModelFailed'), err)
    } finally {
      setLoadingModel(false)
    }
  }

  // The sheet with what to take or bring in: open while there is a tree.
  const [exportTree, setExportTree] = useState<BackupTree | null>(null)
  const [opened, setOpened] = useState<OpenedBackup | null>(null)

  const onExport = async () => {
    setExporting(true)
    try {
      setExportTree(await loadBackupTree(db))
    } catch (err) {
      reportError(t('settings.exportFailedTitle'), err)
    } finally {
      setExporting(false)
    }
  }

  const runExport = async (selection: Selection) => {
    setExportTree(null)
    setExporting(true)
    try {
      const saved = await exportBackup(db, selection)
      if (saved) {
        showToast({
          tone: 'success',
          title: t('settings.exportDoneTitle'),
          message: t('settings.exportDoneMessage', { name: saved.name, folder: saved.folder }),
        })
      }
    } catch (err) {
      reportError(t('settings.exportFailedTitle'), err)
    } finally {
      setExporting(false)
    }
  }

  const onImport = async () => {
    setImporting(true)
    try {
      setOpened(await readBackup())
    } catch (err) {
      reportError(t('settings.importFailedTitle'), err)
    } finally {
      setImporting(false)
    }
  }

  const runImport = async (selection: Selection) => {
    const backup = opened
    setOpened(null)
    if (!backup) return
    setImporting(true)
    try {
      const result = await importBackup(db, backup, selection)
      showToast({
        tone: 'success',
        title: t('settings.importDoneTitle'),
        message: t('settings.importDoneMessage', { characters: result.characters, rooms: result.rooms, chats: result.chats }),
      })
    } catch (err) {
      reportError(t('settings.importFailedTitle'), err)
    } finally {
      setImporting(false)
    }
  }

  const onWipe = () => {
    confirm({
      title: t('settings.wipeConfirmTitle'),
      message: t('settings.wipeConfirmMessage'),
      confirmLabel: t('settings.wipeConfirmLabel'),
      destructive: true,
      onConfirm: async () => {
        setWiping(true)
        try {
          await wipeAllData(db)
          setCfg(DEFAULT_SETTINGS)
          router.replace('/onboarding')
        } catch (err) {
          reportError(t('settings.wipeFailedTitle'), err)
        } finally {
          setWiping(false)
        }
      },
    })
  }

  const language = (
    <ListSection header={t('settings.language')}>
      {LANGUAGE_OPTIONS.map((o) => (
        <CheckCell key={o.value} label={o.label} checked={localePreference === o.value} onPress={() => setLocalePreference(o.value)} />
      ))}
    </ListSection>
  )

  // The app icon row needs a build with the native module.
  const [appIcon, setAppIconName] = useState(currentAppIcon)
  useFocusEffect(useCallback(() => setAppIconName(currentAppIcon()), []))

  const chatText = useChatTextSettings()
  const appearance = (
    <ListSection>
      <LinkCell
        label={t('settings.appearance')}
        value={`${chatText.font === 'System' ? t('chatFont.system') : chatText.font}, ${Math.round(chatText.scale * 100)}%`}
        onPress={() => router.push('/chat-text')}
      />
      {alternateIconsAvailable ? (
        <LinkCell label={t('settings.appIcon')} value={t(`appIcon.${appIcon ?? 'default'}`)} onPress={() => router.push('/app-icon')} />
      ) : null}
    </ListSection>
  )

  const continueRows = (
    <ListSection header={t('settings.homeScreen')} footer={t('settings.continueButtonNote')}>
      <SwitchCell label={t('settings.continueButton')} value={continueButton} onValueChange={toggleContinueButton} />
      {continueButton
        ? CONTINUE_OPTIONS.map((o) => (
            <CheckCell
              key={o.value}
              label={o.label}
              checked={(continueByVisit ? 'visit' : 'message') === o.value}
              onPress={() => setContinueByVisitValue(o.value === 'visit')}
            />
          ))
        : null}
    </ListSection>
  )

  const privateRow = (
    <ListSection header={t('settings.chats')} footer={t('settings.privateButtonNote')}>
      <SwitchCell label={t('settings.privateButton')} value={privateButton} onValueChange={togglePrivateButton} />
    </ListSection>
  )

  const suggestRow = (
    <ListSection footer={t('settings.suggestButtonNote')}>
      <SwitchCell label={t('settings.suggestButton')} value={suggestions} onValueChange={toggleSuggestions} />
    </ListSection>
  )

  const recentRow = (
    <ListSection footer={t('settings.recentPicturesNote')}>
      <SwitchCell label={t('settings.recentPictures')} value={recentPictures} onValueChange={toggleRecentPictures} />
      {recentPictures ? (
        <>
          <SwitchCell
            label={t('settings.recentUnlimited')}
            value={recent.unlimited}
            onValueChange={(unlimited) => {
              setRecent((r) => ({ ...r, unlimited }))
              setRecentUnlimited(db, unlimited)
            }}
          />
          <InputCell
            label={t('settings.recentCount')}
            value={recentDraft ?? String(recent.count)}
            onChangeText={typeRecentCount}
            keyboardType="number-pad"
            disabled={recent.unlimited}
          />
        </>
      ) : null}
    </ListSection>
  )

  const confirmDeleteRow = (
    <ListSection>
      <SwitchCell label={t('settings.confirmDelete')} value={confirmDelete} onValueChange={toggleConfirmDelete} />
    </ListSection>
  )

  const hapticsRow = (
    <ListSection header={t('settings.feedback')}>
      <SwitchCell label={t('settings.haptics')} value={haptics} onValueChange={toggleHaptics} />
    </ListSection>
  )

  // One group; each row is still its own block, so search can open at either.
  const security = (
    <ListSection header={t('settings.security')} footer={isAndroid ? undefined : t('settings.showInFilesNote')}>
      {block(
        'faceId',
        <SwitchCell label={t(isAndroid ? 'settings.requireBiometrics' : 'settings.requireFaceId')} value={appLock} onValueChange={toggleAppLock} />
      )}
      {isAndroid
        ? null
        : block('files', <SwitchCell label={t('settings.showInFiles')} value={showInFiles} onValueChange={toggleShowInFiles} disabled={movingFiles} />)}
    </ListSection>
  )

  const server = (
    <>
      <ListSection
        header={t('settings.server')}
        footer={
          <>
            <ListFooter>{t('settings.baseUrlHint')}</ListFooter>
            {status.kind === 'ok' || status.kind === 'error' ? <ListFooter danger={status.kind === 'error'}>{status.text}</ListFooter> : null}
          </>
        }
      >
        <InputCell
          label={t('settings.baseUrlLabel')}
          value={cfg.baseUrl}
          onChangeText={(baseUrl) => update({ baseUrl })}
          placeholder={t('settings.baseUrlPlaceholder')}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <InputCell
          label={t('settings.apiKeyLabel')}
          value={cfg.apiKey}
          onChangeText={(apiKey) => update({ apiKey })}
          placeholder={t('settings.apiKeyPlaceholder')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        {/* Typed by hand until the server has listed its models, then picked from them. */}
        {models.length > 0 ? (
          <MenuCell
            label={t('settings.modelLabel')}
            value={models.includes(cfg.model) ? cfg.model : ''}
            placeholder={t('onboarding.pickModel')}
            items={modelItems(models)}
          />
        ) : (
          <InputCell
            label={t('settings.modelLabel')}
            value={cfg.model}
            onChangeText={(model) => update({ model })}
            placeholder={t('settings.modelPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <ButtonCell label={t('settings.testConnection')} onPress={onTest} loading={status.kind === 'testing'} />
        <ButtonCell
          label={t('settings.loadModel')}
          onPress={onLoadModel}
          loading={loadingModel}
          disabled={!cfg.baseUrl.trim() || !cfg.model.trim()}
        />
      </ListSection>

      <ListSection
        header={t('settings.contextLabel')}
        footer={
          cfg.contextMode === 'messages' ? (
            <>
              <ListFooter>{t('settings.contextMessagesHint')}</ListFooter>
              {cfg.chatMessages > 1000 || cfg.roomMessages > 1000 ? <ListFooter danger>{t('settings.contextMessagesWarning')}</ListFooter> : null}
            </>
          ) : modelLoaded ? (
            t('settings.contextHint')
          ) : null
        }
      >
        {CONTEXT_OPTIONS.map((o) => (
          <CheckCell key={o.value} label={o.label} checked={cfg.contextMode === o.value} onPress={() => update({ contextMode: o.value })} />
        ))}
        {cfg.contextMode === 'messages' ? (
          <>
            <InputCell
              label={t('settings.contextChatMessages')}
              value={messageDrafts.chatMessages ?? String(cfg.chatMessages)}
              onChangeText={(text) => setMessages('chatMessages', text)}
              keyboardType="number-pad"
            />
            <InputCell
              label={t('settings.contextRoomMessages')}
              value={messageDrafts.roomMessages ?? String(cfg.roomMessages)}
              onChangeText={(text) => setMessages('roomMessages', text)}
              keyboardType="number-pad"
            />
          </>
        ) : null}
        {cfg.contextMode === 'tokens' && modelLoaded ? (
          // A step of the slider, not a token count: the sizes models come in are doublings.
          <SliderCell
            label={t('settings.contextTokensLabel')}
            value={Math.max(0, CONTEXT_STEPS.indexOf(cfg.contextTokens as (typeof CONTEXT_STEPS)[number]))}
            min={0}
            max={CONTEXT_STEPS.length - 1}
            step={1}
            formatValue={(i) => `${CONTEXT_STEPS[i] / 1024}K`}
            onChange={(i) => update({ contextTokens: CONTEXT_STEPS[i] })}
          />
        ) : null}
      </ListSection>
    </>
  )

  const showCloud = cloudSync.available || cloudPreview
  const cloudBusy = cloudSync.syncing || backingUp
  const folderSync = (
    <ListSection
      header={t('settings.folderSync')}
      footer={cloudSync.enabled || cloudPreview ? `${t('settings.folderSyncSyncNote')}\n\n${cloudStatus}` : t('settings.folderSyncSyncNote')}
    >
      <SwitchCell
        label={t('settings.folderSyncSync')}
        value={cloudSync.enabled}
        onValueChange={toggleCloudSync}
        disabled={cloudBusy || cloudAction !== null}
      />
      {cloudSync.enabled || cloudPreview ? (
        <>
          <ButtonCell
            label={t('settings.folderSyncPush')}
            icon={{ fallback: 'arrow-up', slide: 'up' }}
            onPress={() => runCloud('push', cloudSync.pushNow)}
            loading={cloudAction === 'push'}
            disabled={cloudBusy || cloudAction === 'pull'}
          />
          <ButtonCell
            label={t('settings.folderSyncPull')}
            icon={{ fallback: 'arrow-down', slide: 'down' }}
            onPress={() => runCloud('pull', cloudSync.pullNow)}
            loading={cloudAction === 'pull'}
            disabled={cloudBusy || cloudAction === 'push'}
          />
          <ButtonCell
            label={t('settings.folderSyncChangeFolder')}
            icon={{ fallback: 'folder-outline' }}
            onPress={() => cloudSync.changeFolder().catch((err) => reportError(t('sync.failedTitle'), err))}
            disabled={cloudBusy || cloudAction !== null}
          />
        </>
      ) : null}
    </ListSection>
  )

  const limitRows = (
    <ListSection header={t('settings.limitsTitle')} footer={t('settings.limitsNote')}>
      <SwitchCell
        label={t('settings.limitsOff')}
        value={limits.off}
        onValueChange={(off) => {
          setLimits((l) => ({ ...l, off }))
          setLimitsOff(db, off)
        }}
      />
      {/* Switched off, the numbers stay as they were but cannot be touched. */}
      <InputCell
        label={t('settings.limitAvatar')}
        value={limitDrafts.avatarMb ?? String(limits.avatarMb)}
        onChangeText={(text) => typeLimit('avatarMb', text)}
        keyboardType="number-pad"
        disabled={limits.off}
      />
      <InputCell
        label={t('settings.limitAttachment')}
        value={limitDrafts.attachmentMb ?? String(limits.attachmentMb)}
        onChangeText={(text) => typeLimit('attachmentMb', text)}
        keyboardType="number-pad"
        disabled={limits.off}
      />
    </ListSection>
  )

  const backup = (
    <>
      <ListSection header={t('settings.backupTitle')} footer={t('settings.backupNote')}>
        <ButtonCell label={t('settings.exportJson')} onPress={onExport} loading={exporting} disabled={cloudAction !== null} />
        <ButtonCell label={t('settings.importJson')} onPress={onImport} loading={importing} disabled={cloudAction !== null} />
      </ListSection>
      <BackupTreeSheet tree={exportTree} confirmLabel={t('settings.exportJson')} onConfirm={runExport} onClose={() => setExportTree(null)} />
      <BackupTreeSheet tree={opened?.tree ?? null} confirmLabel={t('settings.importJson')} onConfirm={runImport} onClose={() => setOpened(null)} />
    </>
  )

  const aboutRow = (
    <ListSection header={t('settings.aboutTitle')}>
      <LinkCell label={t('settings.aboutReverie')} onPress={() => router.push('/about')} />
    </ListSection>
  )

  const wipe = (
    <ListSection header={t('settings.dangerZone')} footer={t('settings.dangerNote')}>
      <ButtonCell danger label={t('settings.wipeAll')} onPress={onWipe} loading={wiping} />
    </ListSection>
  )

  return (
    <View style={styles.screen}>
      {loaded ? (
        <KeyboardAwareScrollView
          ref={scrollRef}
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
        >
          {block('appearance', appearance)}
          {block('language', language)}
          {block('continue', continueRows)}
          {block('private', privateRow)}
          {block('suggest', suggestRow)}
          {block('recents', recentRow)}
          {block('confirmDelete', confirmDeleteRow)}
          {block('haptics', hapticsRow)}
          {security}
          {block('limits', limitRows)}
          {block('server', server)}
          {showCloud ? block('folderSync', folderSync) : null}
          {block('backup', backup)}
          {aboutRow}
          {block('wipe', wipe)}
        </KeyboardAwareScrollView>
      ) : null}

      <GlassHeader floating>
        <TabTitle>{t('settings.title')}</TabTitle>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    // Reaches a little past the block, so the tint frames it instead of hugging the text.
    flash: { top: -8, bottom: -8, left: -10, right: -10, borderRadius: 30 },
  })
