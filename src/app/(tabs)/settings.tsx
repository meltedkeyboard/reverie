import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import { StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'

import { ButtonCell, CheckCell, InputCell, LinkCell, ListFooter, ListSection, SegmentCell, SliderCell, SwitchCell } from '@/components/lists/GroupedList'
import {
  nativeForm,
  NativeActionRow,
  NativeForm,
  NativeHostedRow,
  NativeLinkRow,
  NativeSection,
  NativeSegmentRow,
  NativeSliderRow,
  NativeTextRow,
} from '@/components/lists/NativeForm'
import { Flash } from '@/components/overlays/Flash'
import { GlassHeader, TabTitle, useHeaderHeight, useScreenPadding } from '@/components/chrome/GlassHeader'
import { isAppLockEnabled, setAppLockEnabled } from '@/db/prefs/appLock'
import { isConfirmDeleteEnabled, setConfirmDeleteEnabled } from '@/db/prefs/confirmDelete'
import { isContinueByVisit, isContinueEnabled, setContinueByVisit, setContinueEnabled } from '@/db/prefs/continue'
import { getFileLimits } from '@/lib/settings/fileLimits'
import { loadFileLimits, setAttachmentLimitMb, setAvatarLimitMb, setBackgroundLimitMb, setLimitsOff } from '@/db/prefs/fileLimits'
import { isDirectionEnabled, isPersonasEnabled, setDirectionEnabled, setPersonasEnabled } from '@/db/prefs/features'
import { isHapticsEnabled, setHapticsEnabled } from '@/db/prefs/haptics'
import {
  isAttachGalleryEnabled,
  isRecentAttachmentsEnabled,
  loadRecentSettings,
  setAttachGalleryEnabled,
  setRecentAttachmentsEnabled,
  setRecentCount,
  setRecentUnlimited,
  type RecentSettings,
  DEFAULT_RECENT_COUNT,
} from '@/db/recentAttachments'
import { isPrivateChatEnabled, setPrivateChatEnabled } from '@/db/prefs/privateChat'
import { listPersonas, onPersonasChanged, type Persona } from '@/db/personas'
import { listLorebooks } from '@/db/lorebooks'
import { loadLongMemory, saveLongMemory } from '@/db/prefs/memory'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useDatabase, useShowInFiles } from '@/db/provider'
import { DEFAULT_SETTINGS, loadSettings, saveContextLimits, serverName, typedCount, updateServer, type ContextLimits } from '@/db/prefs/settings'
import {
  isSuggestionsEnabled,
  loadSuggestionTokens,
  saveSuggestionTokens,
  setSuggestionsEnabled,
  SUGGESTION_TOKENS,
} from '@/db/prefs/suggestions'
import { useCloudSync } from '@/hooks/features/useCloudSync'
import { useServers } from '@/hooks/features/useServers'
import { useStoredFlag } from '@/hooks/util/useStoredFlag'
import { useTranslation, type LocalePreference } from '@/i18n'
import { CONTEXT_STEP_TOKENS, MAX_CONTEXT_TOKENS, MIN_CONTEXT_TOKENS, formatTokensLabel } from '@/lib/core/context'
import { ChipRowCell } from '@/components/lists/PictureCells'
import { BackupTreeSheet } from '@/components/overlays/BackupTreeSheet'
import { exportBackup, loadBackupTree, wipeAllData } from '@/lib/transfer/backup'
import { useBackupImport } from '@/hooks/features/useBackupImport'
import type { BackupTree, Selection } from '@/lib/transfer/backupSelection'
import { alternateIconsAvailable, currentAppIcon } from '@/lib/settings/appIcons'
import { confirm } from '@/lib/ui/dialogs'
import { showToast } from '@/lib/ui/toast'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { formatWhen } from '@/lib/core/format'
import { selectionAsync } from '@/lib/ui/haptics'
import type { SettingsSection } from '@/lib/core/searchScope'
import { isShownInFiles } from '@/lib/core/storage'
import { reportError } from '@/lib/transfer/report'
import { isAndroid } from '@/lib/core/platform'
import { type Colors, HEADER_ROW_HEIGHT, useColors, useStyles } from '@/theme'


export default function SettingsScreen() {
  const db = useDatabase()
  const router = useRouter()
  const colors = useColors()
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
  // In the system's list the section is scrolled to by its id, with no flash. The module is
  // there or not for the life of the app, so the hook is called on every render or on none.
  const jumpTo = nativeForm?.ui.useNativeState<string | null>(null)

  // Runs when the parameter arrives and again as sections are laid out, since on the
  // first visit the one asked for may not have been measured yet. The parameter is
  // cleared afterwards, so asking for the same section again scrolls once more.
  const jump = useCallback(() => {
    if (jumpTo) {
      if (!section) return
      jumpTo.set(null)
      jumpTo.set(section)
      router.setParams({ section: undefined })
      return
    }
    const y = section && offsets.current[section]
    if (!section || y === undefined) return
    scrollRef.current?.scrollTo({ y: Math.max(0, y - headerHeight - 16), animated: true })
    setFlashed((prev) => ({ section, n: (prev?.n ?? 0) + 1 }))
    router.setParams({ section: undefined })
  }, [section, headerHeight, router, jumpTo])

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

  const CONTINUE_OPTIONS: { value: 'visit' | 'message'; label: string }[] = [
    { value: 'visit', label: t('settings.continueByVisit') },
    { value: 'message', label: t('settings.continueByMessage') },
  ]
  const LANGUAGE_OPTIONS: { value: LocalePreference; label: string }[] = [
    { value: 'system', label: t('language.system') },
    { value: 'ru', label: t('language.ru') },
    { value: 'en', label: t('language.en') },
  ]

  // The limits on history hold for every server; the servers themselves have a screen of their own.
  const [context, setContext] = useState<ContextLimits | null>(null)
  useEffect(() => {
    loadSettings(db).then(({ limitMessages, chatMessages, roomMessages }) => setContext({ limitMessages, chatMessages, roomMessages }))
  }, [db])
  const loaded = context !== null
  const cfg: ContextLimits = context ?? DEFAULT_SETTINGS
  const update = (patch: Partial<ContextLimits>) => {
    const next = { limitMessages: cfg.limitMessages, chatMessages: cfg.chatMessages, roomMessages: cfg.roomMessages, ...patch }
    setContext(next)
    saveContextLimits(db, next)
  }
  const { servers, activeId } = useServers()
  const activeServer = servers?.find((s) => s.id === activeId)
  const activeServerLabel = activeServer ? serverName(activeServer) || t('servers.untitled') : t('servers.none')
  // The current server's context window, at hand without opening the server. What the slider
  // is dragged to is shown until the list read back from the database catches up.
  const [contextDraft, setContextDraft] = useState<number | null>(null)
  useEffect(() => setContextDraft(null), [activeId])
  const contextTokens = contextDraft ?? activeServer?.contextTokens ?? DEFAULT_SETTINGS.contextTokens
  const setContextTokens = (tokens: number) => {
    if (!activeServer) return
    setContextDraft(tokens)
    updateServer(db, activeServer.id, { contextTokens: tokens })
  }

  // What is typed in the message-count fields: it may be empty on the way to a new number.
  const [messageDrafts, setMessageDrafts] = useState<{ chatMessages?: string; roomMessages?: string }>({})
  const setMessages = (field: 'chatMessages' | 'roomMessages', text: string) => {
    const { digits, count } = typedCount(text)
    setMessageDrafts((d) => ({ ...d, [field]: digits }))
    if (count) update({ [field]: count })
  }
  // The size limits: the numbers may be empty while being retyped, a number below 1 is not kept.
  const [limits, setLimits] = useState(getFileLimits)
  const [limitDrafts, setLimitDrafts] = useState<{ avatarMb?: string; backgroundMb?: string; attachmentMb?: string }>({})
  useEffect(() => {
    loadFileLimits(db).then(setLimits)
  }, [db])
  const typeLimit = (field: 'avatarMb' | 'backgroundMb' | 'attachmentMb', text: string) => {
    const { digits, count } = typedCount(text)
    setLimitDrafts((d) => ({ ...d, [field]: digits }))
    if (!count) return
    setLimits((l) => ({ ...l, [field]: count }))
    if (field === 'avatarMb') setAvatarLimitMb(db, count)
    else if (field === 'backgroundMb') setBackgroundLimitMb(db, count)
    else setAttachmentLimitMb(db, count)
  }
  const [exporting, setExporting] = useState(false)
  const backupImport = useBackupImport()
  const importing = backupImport.importing
  const backingUp = exporting || importing
  const [wiping, setWiping] = useState(false)
  const [continueButton, toggleContinueButton] = useStoredFlag(isContinueEnabled, setContinueEnabled, true)
  const [continueByVisit, setContinueByVisitValue] = useStoredFlag(isContinueByVisit, setContinueByVisit, true)
  const [privateButton, togglePrivateButton] = useStoredFlag(isPrivateChatEnabled, setPrivateChatEnabled, true)
  const [suggestions, toggleSuggestions] = useStoredFlag(isSuggestionsEnabled, setSuggestionsEnabled, false)
  const [suggestionTokens, setSuggestionTokens] = useState<number>(SUGGESTION_TOKENS.default)
  useEffect(() => {
    loadSuggestionTokens(db).then(setSuggestionTokens)
  }, [db])
  const [recentPictures, toggleRecentPictures] = useStoredFlag(isRecentAttachmentsEnabled, setRecentAttachmentsEnabled, true)
  const [personasOn, togglePersonas] = useStoredFlag(isPersonasEnabled, setPersonasEnabled, true)
  const [directionOn, toggleDirection] = useStoredFlag(isDirectionEnabled, setDirectionEnabled, true)
  const [attachGallery, toggleAttachGallery] = useStoredFlag(isAttachGalleryEnabled, setAttachGalleryEnabled, true)
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

  const [personas, setPersonas] = useState<Persona[]>([])
  useEffect(() => {
    let alive = true
    const load = () => {
      listPersonas(db).then((list) => {
        if (alive) setPersonas(list)
      })
    }
    load()
    const unsub = onPersonasChanged(load)
    return () => {
      alive = false
      unsub()
    }
  }, [db])

  const [longMemory, toggleLongMemory] = useStoredFlag(loadLongMemory, saveLongMemory, false)
  // How many lorebooks there are, counted again whenever Settings comes back into view.
  const [lorebookCount, setLorebookCount] = useState(0)
  const countLorebooks = useCallback(async () => setLorebookCount((await listLorebooks(db)).length), [db])
  useReloadOnFocus(countLorebooks)

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

  // The system's switch stays where it was flicked to whatever its value says, so when the
  // lock is refused it is built anew, back off.
  const [lockSwitch, setLockSwitch] = useState(0)
  const toggleAppLock = async (enabled: boolean) => {
    if (enabled) {
      // Verify it works before turning it on, so the app can't lock the user out.
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
        showToast({
          tone: 'error',
          title: t(isAndroid ? 'settings.requireBiometrics' : 'settings.requireFaceId'),
          message: t(`settings.${isAndroid ? 'biometricsUnavailable' : 'faceIdUnavailable'}`),
        })
        setLockSwitch((n) => n + 1)
        return
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })
      if (!result.success) {
        setLockSwitch((n) => n + 1)
        return
      }
    }
    setAppLock(enabled)
  }

  // The sheet with what to take or bring in: open while there is a tree.
  const [exportTree, setExportTree] = useState<BackupTree | null>(null)

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
      <LinkCell label={t('servers.title')} value={activeServerLabel} onPress={() => router.push('/servers')} />
    </ListSection>
  )

  const continueRows = (
    <ListSection header={t('settings.homeScreen')} footer={t('settings.continueButtonNote')}>
      <SwitchCell label={t('settings.continueButton')} value={continueButton} onValueChange={toggleContinueButton} />
      {continueButton ? (
        <SegmentCell
          label={t('settings.continueBy')}
          options={CONTINUE_OPTIONS}
          value={continueByVisit ? 'visit' : 'message'}
          onChange={(value) => setContinueByVisitValue(value === 'visit')}
        />
      ) : null}
    </ListSection>
  )

  const attachGalleryRow = (
    <ListSection footer={t('settings.attachGalleryNote')}>
      <SwitchCell label={t('settings.attachGallery')} value={attachGallery} onValueChange={toggleAttachGallery} />
    </ListSection>
  )

  // Personas and direction can be switched off whole; their list and texts are kept.
  const personasRow = (
    <ListSection header={t('persona.title')} footer={personasOn ? t('persona.emptyText') : t('settings.personasOffNote')}>
      <SwitchCell label={t('settings.personasOn')} value={personasOn} onValueChange={togglePersonas} />
      {personasOn ? (
        <LinkCell
          label={t('persona.title')}
          value={personas.length > 0 ? String(personas.length) : t('persona.none')}
          onPress={() => router.push('/personas')}
        />
      ) : null}
    </ListSection>
  )

  const directionRow = (
    <ListSection footer={t('settings.directionNote')}>
      <SwitchCell label={t('direction.title')} value={directionOn} onValueChange={toggleDirection} />
    </ListSection>
  )

  const memoryRows = (
    <ListSection
      header={t('memory.section')}
      footer={
        <>
          <ListFooter>{t('memory.longHint')}</ListFooter>
          <ListFooter>{t('lore.settingsHint')}</ListFooter>
        </>
      }
    >
      <SwitchCell label={t('memory.long')} value={longMemory} onValueChange={toggleLongMemory} />
      <LinkCell
        label={t('lore.title')}
        value={lorebookCount > 0 ? String(lorebookCount) : t('lore.none')}
        onPress={() => router.push('/lorebooks')}
      />
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
      {suggestions ? (
        <SliderCell
          label={t('settings.suggestTokens')}
          value={suggestionTokens}
          min={SUGGESTION_TOKENS.min}
          max={SUGGESTION_TOKENS.max}
          step={SUGGESTION_TOKENS.step}
          onChange={(tokens) => {
            setSuggestionTokens(tokens)
            saveSuggestionTokens(db, tokens)
          }}
        />
      ) : null}
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

  const contextFooter = (
    <>
      <ListFooter>{t('settings.contextHint')}</ListFooter>
      {cfg.limitMessages ? (
        <>
          <ListFooter>{t('settings.contextMessagesHint')}</ListFooter>
          {cfg.chatMessages > 1000 || cfg.roomMessages > 1000 ? <ListFooter danger>{t('settings.contextMessagesWarning')}</ListFooter> : null}
        </>
      ) : null}
    </>
  )

  const server = (
    <>
      <ListSection header={t('settings.contextLabel')} footer={contextFooter}>
        {activeServer ? (
          <SliderCell
            label={t('settings.contextTokensLabel')}
            value={contextTokens}
            min={MIN_CONTEXT_TOKENS}
            max={MAX_CONTEXT_TOKENS}
            step={CONTEXT_STEP_TOKENS}
            formatValue={(tokens) => formatTokensLabel(tokens)}
            onChange={setContextTokens}
          />
        ) : null}
        <SwitchCell
          label={t('settings.contextMessages')}
          value={cfg.limitMessages}
          onValueChange={(limitMessages) => update({ limitMessages })}
        />
        <InputCell
          label={t('settings.contextChatMessages')}
          value={messageDrafts.chatMessages ?? String(cfg.chatMessages)}
          onChangeText={(text) => setMessages('chatMessages', text)}
          keyboardType="number-pad"
          disabled={!cfg.limitMessages}
        />
        <InputCell
          label={t('settings.contextRoomMessages')}
          value={messageDrafts.roomMessages ?? String(cfg.roomMessages)}
          onChangeText={(text) => setMessages('roomMessages', text)}
          keyboardType="number-pad"
          disabled={!cfg.limitMessages}
        />
      </ListSection>
    </>
  )

  const showCloud = cloudSync.available || cloudPreview
  const cloudBusy = cloudSync.syncing || backingUp
  const cloudChips = (
    <ChipRowCell
      actions={[
        {
          label: t('settings.folderSyncPush'),
          icon: { symbol: 'arrow.up', fallback: 'arrow-up' },
          slide: 'up',
          onPress: () => runCloud('push', cloudSync.pushNow),
          loading: cloudAction === 'push',
          disabled: cloudBusy || cloudAction === 'pull',
        },
        {
          label: t('settings.folderSyncPull'),
          icon: { symbol: 'arrow.down', fallback: 'arrow-down' },
          slide: 'down',
          onPress: () => runCloud('pull', cloudSync.pullNow),
          loading: cloudAction === 'pull',
          disabled: cloudBusy || cloudAction === 'push',
        },
        {
          label: t('settings.folderSyncChangeFolder'),
          icon: { symbol: 'folder', fallback: 'folder-outline' },
          onPress: () => cloudSync.changeFolder().catch((err) => reportError(t('sync.failedTitle'), err)),
          disabled: cloudBusy || cloudAction !== null,
        },
      ]}
    />
  )
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
      {cloudSync.enabled || cloudPreview ? cloudChips : null}
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
        label={t('settings.limitBackground')}
        value={limitDrafts.backgroundMb ?? String(limits.backgroundMb)}
        onChangeText={(text) => typeLimit('backgroundMb', text)}
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

  const backupChips = (
    <ChipRowCell
      actions={[
        {
          label: t('settings.exportJson'),
          icon: { symbol: 'square.and.arrow.up', fallback: 'share-outline' },
          labeled: true,
          onPress: onExport,
          loading: exporting,
          disabled: cloudAction !== null || importing,
        },
        {
          label: t('settings.importJson'),
          icon: { symbol: 'square.and.arrow.down', fallback: 'download-outline' },
          labeled: true,
          onPress: backupImport.pick,
          loading: importing,
          disabled: cloudAction !== null || exporting,
        },
      ]}
    />
  )
  // What the backup opens over the page, on either page.
  const backupSheets = (
    <>
      <BackupTreeSheet tree={exportTree} confirmLabel={t('settings.exportJson')} onConfirm={runExport} onClose={() => setExportTree(null)} />
      {backupImport.sheet}
    </>
  )
  const backup = (
    <>
      <ListSection header={t('settings.backupTitle')} footer={t('settings.backupNote')}>
        {backupChips}
      </ListSection>
      {backupSheets}
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

  // The same page as the system's own list (iOS with SwiftUI). The model's chips and the rows
  // of chips for the sync and the backup stay React Native views in rows of their own.
  const renderNative = ({ ui, modifiers }: NonNullable<typeof nativeForm>) => {
    const { Picker, Text: SwiftText, HStack, Spacer, Toggle, Button: SwiftButton, Image, ProgressView, SwipeActions } = ui
    const { pickerStyle, tag, labelsHidden, disabled, id, tint, foregroundStyle, lineLimit } = modifiers
    const toggle = (name: string | null, label: string, isOn: boolean, onChange: (on: boolean) => void, off = false, key?: string) => (
      <Toggle key={key} label={label} isOn={isOn} onIsOnChange={onChange} modifiers={[disabled(off), ...(name ? [id(name)] : [])]} />
    )
    const numberRow = (label: string, value: string, onChange: (text: string) => void, off: boolean) => (
      <NativeTextRow label={label} value={value} onChangeText={onChange} keyboard="number-pad" disabled={off} />
    )
    return (
      <NativeForm jumpTo={jumpTo}>
        <NativeSection id="appearance" inset={HEADER_ROW_HEIGHT}>
          <NativeLinkRow
            label={t('settings.appearance')}
            value={`${chatText.font === 'System' ? t('chatFont.system') : chatText.font}, ${Math.round(chatText.scale * 100)}%`}
            onPress={() => router.push('/chat-text')}
          />
          {alternateIconsAvailable ? (
            <NativeLinkRow label={t('settings.appIcon')} value={t(`appIcon.${appIcon ?? 'default'}`)} onPress={() => router.push('/app-icon')} />
          ) : null}
          <NativeLinkRow label={t('servers.title')} value={activeServerLabel} onPress={() => router.push('/servers')} />
        </NativeSection>

        <NativeSection id="language" title={t('settings.language')}>
          <Picker
            selection={localePreference}
            onSelectionChange={(next: LocalePreference) => {
              selectionAsync()
              setLocalePreference(next)
            }}
            modifiers={[pickerStyle('inline'), labelsHidden()]}
          >
            {LANGUAGE_OPTIONS.map((o) => (
              <SwiftText key={o.value} modifiers={[tag(o.value)]}>
                {o.label}
              </SwiftText>
            ))}
          </Picker>
        </NativeSection>

        <NativeSection id="continue" title={t('settings.homeScreen')} footer={t('settings.continueButtonNote')}>
          {toggle(null, t('settings.continueButton'), continueButton, toggleContinueButton)}
          {continueButton ? (
            <NativeSegmentRow
              label={t('settings.continueBy')}
              options={CONTINUE_OPTIONS}
              value={continueByVisit ? 'visit' : 'message'}
              onChange={(value) => {
                selectionAsync()
                setContinueByVisitValue(value === 'visit')
              }}
            />
          ) : null}
        </NativeSection>

        <NativeSection id="private" title={t('settings.chats')} footer={t('settings.privateButtonNote')}>
          {toggle(null, t('settings.privateButton'), privateButton, togglePrivateButton)}
        </NativeSection>

        <NativeSection id="memory" title={t('memory.section')} footer={[{ text: t('memory.longHint') }, { text: t('lore.settingsHint') }]}>
          {toggle(null, t('memory.long'), longMemory, toggleLongMemory)}
          <NativeLinkRow
            label={t('lore.title')}
            value={lorebookCount > 0 ? String(lorebookCount) : t('lore.none')}
            onPress={() => router.push('/lorebooks')}
          />
        </NativeSection>

        <NativeSection id="personas" title={t('persona.title')} footer={personasOn ? t('persona.emptyText') : t('settings.personasOffNote')}>
          {toggle(null, t('settings.personasOn'), personasOn, togglePersonas)}
          {personasOn ? (
            <NativeLinkRow
              label={t('persona.title')}
              value={personas.length > 0 ? String(personas.length) : t('persona.none')}
              onPress={() => router.push('/personas')}
            />
          ) : null}
        </NativeSection>

        <NativeSection id="direction" footer={t('settings.directionNote')}>
          {toggle(null, t('direction.title'), directionOn, toggleDirection)}
        </NativeSection>

        <NativeSection id="suggest" footer={t('settings.suggestButtonNote')}>
          {toggle(null, t('settings.suggestButton'), suggestions, toggleSuggestions)}
          {suggestions ? (
            <NativeSliderRow
              label={t('settings.suggestTokens')}
              value={suggestionTokens}
              min={SUGGESTION_TOKENS.min}
              max={SUGGESTION_TOKENS.max}
              step={SUGGESTION_TOKENS.step}
              onChange={(tokens) => {
                setSuggestionTokens(tokens)
                saveSuggestionTokens(db, tokens)
              }}
            />
          ) : null}
        </NativeSection>

        <NativeSection id="recents" footer={t('settings.recentPicturesNote')}>
          {toggle(null, t('settings.recentPictures'), recentPictures, toggleRecentPictures)}
          {recentPictures
            ? toggle(null, t('settings.recentUnlimited'), recent.unlimited, (unlimited) => {
                setRecent((r) => ({ ...r, unlimited }))
                setRecentUnlimited(db, unlimited)
              })
            : null}
          {recentPictures ? numberRow(t('settings.recentCount'), recentDraft ?? String(recent.count), typeRecentCount, recent.unlimited) : null}
        </NativeSection>

        <NativeSection id="attachGallery" footer={t('settings.attachGalleryNote')}>
          {toggle(null, t('settings.attachGallery'), attachGallery, toggleAttachGallery)}
        </NativeSection>

        <NativeSection id="confirmDelete">{toggle(null, t('settings.confirmDelete'), confirmDelete, toggleConfirmDelete)}</NativeSection>

        <NativeSection id="haptics" title={t('settings.feedback')}>
          {toggle(null, t('settings.haptics'), haptics, toggleHaptics)}
        </NativeSection>

        <NativeSection title={t('settings.security')} footer={t('settings.showInFilesNote')}>
          {toggle('faceId', t('settings.requireFaceId'), appLock, toggleAppLock, false, `lock${lockSwitch}`)}
          {toggle('files', t('settings.showInFiles'), showInFiles, toggleShowInFiles, movingFiles)}
        </NativeSection>

        <NativeSection id="limits" title={t('settings.limitsTitle')} footer={t('settings.limitsNote')}>
          {toggle(null, t('settings.limitsOff'), limits.off, (off) => {
            setLimits((l) => ({ ...l, off }))
            setLimitsOff(db, off)
          })}
          {numberRow(t('settings.limitAvatar'), limitDrafts.avatarMb ?? String(limits.avatarMb), (text) => typeLimit('avatarMb', text), limits.off)}
          {numberRow(t('settings.limitBackground'), limitDrafts.backgroundMb ?? String(limits.backgroundMb), (text) => typeLimit('backgroundMb', text), limits.off)}
          {numberRow(t('settings.limitAttachment'), limitDrafts.attachmentMb ?? String(limits.attachmentMb), (text) => typeLimit('attachmentMb', text), limits.off)}
        </NativeSection>

        <NativeSection
          id="server"
          title={t('settings.contextLabel')}
          footer={[
            { text: t('settings.contextHint') },
            ...(cfg.limitMessages ? [{ text: t('settings.contextMessagesHint') }] : []),
            ...(cfg.limitMessages && (cfg.chatMessages > 1000 || cfg.roomMessages > 1000) ? [{ text: t('settings.contextMessagesWarning'), danger: true }] : []),
          ]}
        >
          {activeServer ? (
            <NativeSliderRow
              label={t('settings.contextTokensLabel')}
              value={contextTokens}
              min={MIN_CONTEXT_TOKENS}
              max={MAX_CONTEXT_TOKENS}
              step={CONTEXT_STEP_TOKENS}
              format={(tokens) => formatTokensLabel(tokens)}
              onChange={setContextTokens}
            />
          ) : null}
          {toggle(null, t('settings.contextMessages'), cfg.limitMessages, (limitMessages) => update({ limitMessages }))}
          {numberRow(t('settings.contextChatMessages'), messageDrafts.chatMessages ?? String(cfg.chatMessages), (text) => setMessages('chatMessages', text), !cfg.limitMessages)}
          {numberRow(t('settings.contextRoomMessages'), messageDrafts.roomMessages ?? String(cfg.roomMessages), (text) => setMessages('roomMessages', text), !cfg.limitMessages)}
        </NativeSection>

        {showCloud ? (
          <NativeSection
            id="folderSync"
            title={t('settings.folderSync')}
            footer={cloudSync.enabled || cloudPreview ? `${t('settings.folderSyncSyncNote')}\n\n${cloudStatus}` : t('settings.folderSyncSyncNote')}
          >
            {toggle(null, t('settings.folderSyncSync'), cloudSync.enabled, toggleCloudSync, cloudBusy || cloudAction !== null)}
            {cloudSync.enabled || cloudPreview ? <NativeHostedRow>{cloudChips}</NativeHostedRow> : null}
          </NativeSection>
        ) : null}

        <NativeSection id="backup" title={t('settings.backupTitle')} footer={t('settings.backupNote')}>
          <NativeHostedRow>{backupChips}</NativeHostedRow>
        </NativeSection>

        <NativeSection title={t('settings.aboutTitle')}>
          <NativeLinkRow label={t('settings.aboutReverie')} onPress={() => router.push('/about')} />
        </NativeSection>

        <NativeSection id="wipe" title={t('settings.dangerZone')} footer={t('settings.dangerNote')}>
          <NativeActionRow label={t('settings.wipeAll')} destructive busy={wiping} onPress={onWipe} />
        </NativeSection>
      </NativeForm>
    )
  }

  return (
    <View style={styles.screen}>
      {loaded && nativeForm ? (
        <>
          {renderNative(nativeForm)}
          {backupSheets}
        </>
      ) : loaded ? (
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
          {block('memory', memoryRows)}
          {block('personas', personasRow)}
          {block('direction', directionRow)}
          {block('suggest', suggestRow)}
          {block('recents', recentRow)}
          {block('attachGallery', attachGalleryRow)}
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
