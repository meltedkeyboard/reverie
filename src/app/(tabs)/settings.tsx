import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'

import { ButtonCell, CheckCell, ChipChoiceCell, InputCell, LinkCell, ListFooter, ListSection, MenuCell, SliderCell, SwitchCell } from '@/components/lists/GroupedList'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import {
  inspectLoadedModel,
  listLoadedModels,
  loadModel,
  resetSkippedModelMismatch,
  unloadAllModels,
  unloadSingleModel,
  type LoadedModelEntry,
  type LoadedModelInfo,
} from '@/api/llm'
import { Flash } from '@/components/overlays/Flash'
import { GlassHeader, TabTitle, useHeaderHeight, useScreenPadding } from '@/components/chrome/GlassHeader'
import { isAppLockEnabled, setAppLockEnabled } from '@/db/prefs/appLock'
import { isConfirmDeleteEnabled, setConfirmDeleteEnabled } from '@/db/prefs/confirmDelete'
import { isContinueByVisit, isContinueEnabled, setContinueByVisit, setContinueEnabled } from '@/db/prefs/continue'
import { getFileLimits } from '@/lib/settings/fileLimits'
import { loadFileLimits, setAttachmentLimitMb, setAvatarLimitMb, setBackgroundLimitMb, setLimitsOff } from '@/db/prefs/fileLimits'
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
import { listPersonas, onPersonasChanged, type Persona } from '@/db/personas'
import { useDatabase, useShowInFiles } from '@/db/provider'
import { DEFAULT_SETTINGS, saveSettings, typedCount, type ServerSettings } from '@/db/prefs/settings'
import {
  isSuggestionsEnabled,
  loadSuggestionTokens,
  saveSuggestionTokens,
  setSuggestionsEnabled,
  SUGGESTION_TOKENS,
} from '@/db/prefs/suggestions'
import { useCloudSync } from '@/hooks/features/useCloudSync'
import { useServerForm } from '@/hooks/features/useServerForm'
import { useStoredFlag } from '@/hooks/util/useStoredFlag'
import { useTranslation, type LocalePreference } from '@/i18n'
import {
  CONTEXT_STEP_TOKENS,
  MAX_CONTEXT_TOKENS,
  MIN_CONTEXT_TOKENS,
  formatContextTokens,
  formatTokensLabel,
} from '@/lib/core/context'
import { SFIcon } from '@/components/visuals/SFIcon'
import { ChipRowCell } from '@/components/lists/PictureCells'
import { SwipeToDelete } from '@/components/lists/SwipeToDelete'
import { BackupTreeSheet } from '@/components/overlays/BackupTreeSheet'
import { exportBackup, loadBackupTree, wipeAllData } from '@/lib/transfer/backup'
import { useBackupImport } from '@/hooks/features/useBackupImport'
import type { BackupTree, Selection } from '@/lib/transfer/backupSelection'
import { alternateIconsAvailable, currentAppIcon } from '@/lib/settings/appIcons'
import { confirm, showSheet } from '@/lib/ui/dialogs'
import { showToast } from '@/lib/ui/toast'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { formatWhen } from '@/lib/core/format'
import { notificationAsync, NotificationFeedbackType, selectionAsync } from '@/lib/ui/haptics'
import type { SettingsSection } from '@/lib/core/searchScope'
import { isShownInFiles } from '@/lib/core/storage'
import { reportError } from '@/lib/transfer/report'
import { isAndroid, isDesktop } from '@/lib/core/platform'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'
import { Icon } from '@/components/visuals/Icon'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as Haptics from '@/lib/ui/haptics'


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
  const loadingModelRef = useRef(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [loadedModelInfo, setLoadedModelInfo] = useState<LoadedModelInfo | null>(null)
  const [loadedModels, setLoadedModels] = useState<LoadedModelEntry[]>([])
  const [selectedModelIndex, setSelectedModelIndex] = useState<number | null>(null)
  const [unloadingModelIds, setUnloadingModelIds] = useState<Set<string>>(new Set())
  const [unloadingAll, setUnloadingAll] = useState(false)
  const { cfg, setCfg, loaded, update, status, models, modelItems, onTest: runTest } = useServerForm(() => {
    setModelLoaded(false)
    setLoadedModelInfo(null)
  })

  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const checkModelStatus = useCallback(async (currentCfg: typeof cfg, fresh = false) => {
    if (loadingModelRef.current) return
    if (!currentCfg.baseUrl.trim()) {
      setLoadedModelInfo(null)
      setModelLoaded(false)
      setLoadedModels([])
      return
    }
    try {
      const [info, list] = await Promise.all([
        inspectLoadedModel(currentCfg, fresh),
        listLoadedModels(currentCfg, fresh),
      ])
      if (loadingModelRef.current) return
      setLoadedModelInfo(info)
      setModelLoaded(info.isLoaded || list.length > 0)
      setLoadedModels(list)
    } catch {
      // Ignore background probe errors
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    checkModelStatus(cfg)
  }, [loaded, cfg.baseUrl, cfg.model, checkModelStatus])

  useFocusEffect(
    useCallback(() => {
      if (!loaded) return
      checkModelStatus(cfgRef.current, true)
      const interval = setInterval(() => {
        checkModelStatus(cfgRef.current, true)
      }, 3000)
      return () => clearInterval(interval)
    }, [loaded, checkModelStatus]),
  )

  const onTest = async () => {
    const found = await runTest()
    if (found.length === 1 && !found.includes(cfg.model)) {
      update({ model: found[0] })
      checkModelStatus({ ...cfg, model: found[0] }, true)
    } else if (cfg.model.trim()) {
      checkModelStatus(cfg, true)
    }
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
    if (loaded) {
      saveSettings(db, cfg)
      resetSkippedModelMismatch()
    }
  }, [db, cfg, loaded])

  const executeLoadModel = async (replace: boolean, targetModel?: string) => {
    const modelToLoad = targetModel ?? cfg.model
    const configToLoad = targetModel ? { ...cfg, model: targetModel } : cfg
    setLoadingModel(true)
    loadingModelRef.current = true
    try {
      const result = await loadModel(configToLoad, { replace })
      setSelectedModelIndex(null)
      setModelLoaded(true)
      setLoadedModelInfo({
        isLoaded: true,
        loadedContextLength: result?.loadedContextLength ?? configToLoad.contextTokens,
        modelName: modelToLoad,
      })
      const patch: Partial<ServerSettings> = {}
      if (targetModel && targetModel !== cfg.model) {
        patch.model = targetModel
      }
      if (result?.loadedContextLength && result.loadedContextLength > 0) {
        patch.contextTokens = result.loadedContextLength
      }
      if (Object.keys(patch).length > 0) {
        update(patch)
      }
      notificationAsync(NotificationFeedbackType.Success)
      await checkModelStatus(configToLoad, true)
    } catch (err) {
      notificationAsync(NotificationFeedbackType.Error)
      reportError(t('settings.loadModelFailed'), err)
    } finally {
      loadingModelRef.current = false
      setLoadingModel(false)
    }
  }

  const isNameMatch = (first: string, second: string) => {
    if (!first.trim() || !second.trim()) return false
    const normFirst = first.trim().toLowerCase()
    const normSecond = second.trim().toLowerCase()
    if (normFirst === normSecond) return true
    const baseFirst = normFirst.split('/').pop()?.replace(/\.gguf$/i, '') ?? normFirst
    const baseSecond = normSecond.split('/').pop()?.replace(/\.gguf$/i, '') ?? normSecond
    if (baseFirst === baseSecond) return true
    const tagFirst = baseFirst.split(':')[0]
    const tagSecond = baseSecond.split(':')[0]
    return tagFirst === tagSecond
  }

  // At most one model can ever be the active chat model in the UI.
  const computedActiveIndex = (() => {
    if (!cfg.model.trim() || loadedModels.length === 0) return -1
    const target = cfg.model.trim().toLowerCase()

    // 1. Match both model name/id AND context length (distinguishes instances of same model)
    const exactContextIndex = loadedModels.findIndex(
      (entry) =>
        (entry.key.toLowerCase() === target || entry.id.toLowerCase() === target) &&
        entry.contextLength === cfg.contextTokens
    )
    if (exactContextIndex !== -1) return exactContextIndex

    // 2. Exact match by id
    const exactIdIndex = loadedModels.findIndex((entry) => entry.id.toLowerCase() === target)
    if (exactIdIndex !== -1) return exactIdIndex

    // 3. Exact match by key
    const exactKeyIndex = loadedModels.findIndex((entry) => entry.key.toLowerCase() === target)
    if (exactKeyIndex !== -1) return exactKeyIndex

    // 4. Exact match ignoring path prefix or .gguf extension
    const normalizeModelName = (name: string) =>
      name.split('/').pop()?.replace(/\.gguf$/i, '').toLowerCase() ?? name.toLowerCase()
    const targetNormalized = normalizeModelName(target)
    const baseIndex = loadedModels.findIndex(
      (entry) => normalizeModelName(entry.key) === targetNormalized || normalizeModelName(entry.id) === targetNormalized
    )
    if (baseIndex !== -1) return baseIndex

    // 5. Exact match ignoring tag (e.g. "llama3:latest" vs "llama3")
    const stripModelTag = (name: string) => name.split(':')[0].toLowerCase()
    const targetWithoutTag = stripModelTag(target)
    const tagIndex = loadedModels.findIndex(
      (entry) => stripModelTag(entry.key) === targetWithoutTag || stripModelTag(entry.id) === targetWithoutTag
    )
    if (tagIndex !== -1) return tagIndex

    // 6. Single unambiguous prefix match
    const prefixIndices: number[] = []
    loadedModels.forEach((entry, idx) => {
      const key = entry.key.toLowerCase()
      const id = entry.id.toLowerCase()
      if (key.startsWith(target) || id.startsWith(target) || target.startsWith(key) || target.startsWith(id)) {
        prefixIndices.push(idx)
      }
    })
    if (prefixIndices.length === 1) {
      return prefixIndices[0]
    }

    return -1
  })()

  const activeLoadedModelIndex =
    selectedModelIndex !== null && selectedModelIndex >= 0 && selectedModelIndex < loadedModels.length
      ? selectedModelIndex
      : computedActiveIndex

  const onSelectActiveModel = (entry: LoadedModelEntry, index: number) => {
    if (unloadingModelIds.has(entry.id)) return
    selectionAsync()
    setSelectedModelIndex(index)
    const modelName = entry.key || entry.id
    const patch: Partial<ServerSettings> = { model: modelName }
    if (typeof entry.contextLength === 'number' && entry.contextLength > 0) {
      patch.contextTokens = entry.contextLength
    }
    update(patch)
  }

  const isSelectedModelLoaded = Boolean(
    cfg.model.trim() &&
      (activeLoadedModelIndex !== -1 ||
        (modelLoaded &&
          loadedModelInfo?.modelName &&
          isNameMatch(loadedModelInfo.modelName, cfg.model)))
  )

  const onUnloadSingle = async (entry: LoadedModelEntry) => {
    setUnloadingModelIds((prev) => new Set(prev).add(entry.id))
    try {
      await unloadSingleModel(cfg, entry)
      setSelectedModelIndex(null)
      notificationAsync(NotificationFeedbackType.Success)
      const remaining = loadedModels.filter((m) => m.id !== entry.id)
      if (isNameMatch(entry.key, cfg.model) || isNameMatch(entry.id, cfg.model)) {
        if (remaining.length > 0) {
          const nextModel = remaining[0]
          const patch: Partial<ServerSettings> = { model: nextModel.key || nextModel.id }
          if (typeof nextModel.contextLength === 'number' && nextModel.contextLength > 0) {
            patch.contextTokens = nextModel.contextLength
          }
          update(patch)
        }
      }
      await checkModelStatus(cfg, true)
    } catch (err) {
      notificationAsync(NotificationFeedbackType.Error)
      reportError(t('settings.loadModelFailed'), err)
    } finally {
      setUnloadingModelIds((prev) => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
    }
  }

  const onUnloadAll = async () => {
    setUnloadingAll(true)
    try {
      await unloadAllModels(cfg)
      setSelectedModelIndex(null)
      notificationAsync(NotificationFeedbackType.Success)
      setLoadedModels([])
      setModelLoaded(false)
      setLoadedModelInfo(null)
      await checkModelStatus(cfg, true)
    } catch (err) {
      notificationAsync(NotificationFeedbackType.Error)
      reportError(t('settings.loadModelFailed'), err)
    } finally {
      setUnloadingAll(false)
    }
  }

  const onLoadModel = async () => {
    if (loadingModel || !cfg.baseUrl.trim() || !cfg.model.trim()) return

    const probe = await inspectLoadedModel(cfg, true).catch(() => null)
    const isCurrentlyLoaded = modelLoaded || Boolean(probe?.isLoaded || loadedModelInfo?.isLoaded)

    if (isCurrentlyLoaded) {
      showSheet(
        t('settings.loadModelConflictTitle'),
        [
          {
            label: t('settings.loadModelReplace'),
            destructive: true,
            onSelect: () => executeLoadModel(true),
          },
          {
            label: t('settings.loadModelAlongside'),
            onSelect: () => executeLoadModel(false),
          },
        ],
        { message: t('settings.loadModelConflictMessage') },
      )
      return
    }

    executeLoadModel(false)
  }

  const onSelectModel = async (newModel: string) => {
    if (loadingModel || newModel === cfg.model) return
    if (!cfg.baseUrl.trim() || !newModel.trim()) {
      update({ model: newModel })
      return
    }

    const alreadyLoaded = loadedModels.find(
      (m) => isNameMatch(m.key, newModel) || isNameMatch(m.id, newModel)
    )
    if (alreadyLoaded) {
      const patch: Partial<ServerSettings> = { model: newModel }
      if (typeof alreadyLoaded.contextLength === 'number' && alreadyLoaded.contextLength > 0) {
        patch.contextTokens = alreadyLoaded.contextLength
      }
      update(patch)
      setModelLoaded(true)
      return
    }

    const probe = await inspectLoadedModel(cfg, true).catch(() => null)
    const isCurrentlyLoaded = modelLoaded || Boolean(probe?.isLoaded || loadedModelInfo?.isLoaded)

    const isSameModelAndContext =
      probe?.isLoaded &&
      probe?.modelName &&
      (probe.modelName.toLowerCase() === newModel.toLowerCase() ||
        probe.modelName.toLowerCase().startsWith(newModel.toLowerCase()) ||
        newModel.toLowerCase().startsWith(probe.modelName.toLowerCase())) &&
      probe.loadedContextLength === cfg.contextTokens

    if (isSameModelAndContext) {
      update({ model: newModel })
      setModelLoaded(true)
      setLoadedModelInfo(probe)
      return
    }

    if (isCurrentlyLoaded) {
      showSheet(
        t('settings.loadModelConflictTitle'),
        [
          {
            label: t('settings.loadModelReplace'),
            destructive: true,
            onSelect: () => {
              update({ model: newModel })
              executeLoadModel(true, newModel)
            },
          },
          {
            label: t('settings.loadModelAlongside'),
            onSelect: () => {
              update({ model: newModel })
              executeLoadModel(false, newModel)
            },
          },
        ],
        { message: t('settings.loadModelConflictMessage') },
      )
      return
    }

    update({ model: newModel })
    checkModelStatus({ ...cfg, model: newModel }, true)
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
      {continueButton ? (
        <ChipRowCell
          actions={CONTINUE_OPTIONS.map((o) => ({
            label: o.label,
            active: (continueByVisit ? 'visit' : 'message') === o.value,
            onPress: () => setContinueByVisitValue(o.value === 'visit'),
          }))}
        />
      ) : null}
    </ListSection>
  )

  const personasRow = (
    <ListSection header={t('persona.title')} footer={t('persona.emptyText')}>
      <LinkCell
        label={t('persona.title')}
        value={personas.length > 0 ? String(personas.length) : t('persona.none')}
        onPress={() => router.push('/personas')}
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

  const isLoaded = modelLoaded || Boolean(loadedModelInfo?.isLoaded)

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
          <ChipChoiceCell
            label={t('settings.modelLabel')}
            options={models}
            value={cfg.model}
            onChange={onSelectModel}
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
        <ButtonCell label={t('settings.testConnection')} icon={{ symbol: 'bolt.horizontal', fallback: 'pulse-outline' }} onPress={onTest} loading={status.kind === 'testing'} />
        <ButtonCell
          label={isSelectedModelLoaded ? t('settings.reloadModel') : t('settings.loadModel')}
          icon={
            isSelectedModelLoaded
              ? { symbol: 'arrow.clockwise', fallback: 'refresh-outline' }
              : { symbol: 'cpu', fallback: 'hardware-chip-outline' }
          }
          onPress={onLoadModel}
          loading={loadingModel}
          disabled={!cfg.baseUrl.trim() || !cfg.model.trim()}
        />
      </ListSection>

      {loadedModels.length > 0 ? (
        <ListSection
          header={t('settings.loadedModelsHeader')}
          footer={t('settings.loadedModelsHint')}
        >
          {loadedModels.map((entry, index) => {
            const isCurrent = index === activeLoadedModelIndex
            const isUnloading = unloadingModelIds.has(entry.id)
            return (
              <SwipeToUnloadModelRow
                key={entry.id}
                enabled={!isUnloading}
                onUnload={() => onUnloadSingle(entry)}
                onPress={() => onSelectActiveModel(entry, index)}
                name={entry.key || entry.id}
                actionLabel={t('settings.unload')}
              >
                <Pressable
                  onPress={() => onSelectActiveModel(entry, index)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isCurrent }}
                  style={({ pressed }) => [
                    styles.loadedModelRow,
                    pressed && styles.pressedRow,
                    isUnloading && styles.disabled,
                  ]}
                >
                  <View style={styles.checkWrap}>
                    {isCurrent ? (
                      <SFIcon
                        name="checkmark"
                        fallback="checkmark"
                        size={20}
                        color={colors.accent}
                      />
                    ) : null}
                  </View>
                  <View style={styles.loadedModelMain}>
                    <Text style={[styles.loadedModelName, isCurrent && { fontWeight: '600' }]} numberOfLines={1}>
                      {entry.key || entry.id}
                    </Text>
                  </View>
                  {entry.contextLength ? (
                    <Text style={styles.loadedModelTokens}>{formatContextTokens(entry.contextLength)}</Text>
                  ) : null}
                  {isUnloading ? (
                    <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 6 }} />
                  ) : isDesktop ? (
                    <Pressable
                      onPress={(e) => {
                        e?.stopPropagation?.()
                        onUnloadSingle(entry)
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.unload')}
                      hitSlop={8}
                      style={({ pressed }) => [styles.desktopUnloadBtn, pressed && { opacity: 0.7 }]}
                    >
                      <SFIcon name="eject" fallback="close-circle-outline" size={14} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </Pressable>
              </SwipeToUnloadModelRow>
            )
          })}
          <ButtonCell
            label={t('settings.unloadAllModels')}
            icon={{ symbol: 'xmark.circle', fallback: 'close-circle-outline' }}
            danger
            onPress={onUnloadAll}
            loading={unloadingAll}
          />
        </ListSection>
      ) : null}

      <ListSection
        header={t('settings.contextLabel')}
        footer={contextFooter}
      >
        <SliderCell
          label={t('settings.contextTokensLabel')}
          value={cfg.contextTokens}
          min={MIN_CONTEXT_TOKENS}
          max={MAX_CONTEXT_TOKENS}
          step={CONTEXT_STEP_TOKENS}
          formatValue={(tokens) => formatTokensLabel(tokens)}
          onChange={(tokens) => update({ contextTokens: tokens })}
          tintColor={isLoaded ? colors.accent : '#8E8E93'}
        />
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

  const backup = (
    <>
      <ListSection header={t('settings.backupTitle')} footer={t('settings.backupNote')}>
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
      </ListSection>
      <BackupTreeSheet tree={exportTree} confirmLabel={t('settings.exportJson')} onConfirm={runExport} onClose={() => setExportTree(null)} />
      {backupImport.sheet}
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
          {block('personas', personasRow)}
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
    loadedModelRow: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    disabled: { opacity: 0.5 },
    pressedRow: {
      backgroundColor: colors.surfaceRaised,
    },
    checkWrap: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadedModelMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginRight: 6,
    },
    loadedModelName: {
      color: colors.text,
      fontSize: 16,
      flexShrink: 1,
    },
    loadedModelTokens: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '500',
    },
    desktopUnloadBtn: {
      padding: 6,
      borderRadius: 6,
      marginLeft: 4,
    },
    unloadBehind: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 0,
      overflow: 'hidden',
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    unloadBehindLabel: {
      position: 'absolute',
      right: 18,
      width: 120,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
    },
    unloadBehindText: {
      color: ON_ACCENT,
      fontSize: 15,
      fontWeight: '600',
    },
  })

const UNLOAD_TRIGGER = 88
const UNLOAD_SPRING = { damping: 24, stiffness: 240 }

type SwipeToUnloadProps = {
  enabled: boolean
  onUnload: () => void
  onPress: () => void
  name: string
  actionLabel: string
  children: React.ReactNode
}

function SwipeToUnloadModelRow({ enabled, onUnload, onPress, name, actionLabel, children }: SwipeToUnloadProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const offset = useSharedValue(0)
  const armed = useSharedValue(false)

  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      offset.value = e.translationX > 0 ? e.translationX * 0.15 : e.translationX
      const past = -offset.value > UNLOAD_TRIGGER
      if (past !== armed.value) {
        armed.value = past
        scheduleOnRN(tick)
      }
    })
    .onEnd(() => {
      const fire = armed.value
      armed.value = false
      offset.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished && fire) scheduleOnRN(onUnload)
      })
    })

  const peek = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    offset.value = withSequence(withTiming(-40, { duration: 150 }), withSpring(0, UNLOAD_SPRING))
  }

  const content = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))
  const behind = useAnimatedStyle(() => ({
    width: Math.max(0, -offset.value),
    opacity: interpolate(-offset.value, [0, 28], [0, 1], 'clamp'),
  }))
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: withTiming(armed.value ? 1.2 : 1, { duration: 120 }) }] }))

  return (
    <View>
      <Animated.View style={[styles.unloadBehind, { backgroundColor: colors.danger }, behind]}>
        <Animated.View style={[styles.unloadBehindLabel, icon]}>
          <Icon name="close-circle-outline" size={20} color={ON_ACCENT} />
          <Text style={styles.unloadBehindText}>{actionLabel}</Text>
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={content}>
          <Pressable
            onPress={enabled ? onPress : peek}
            accessibilityLabel={name}
            accessibilityActions={enabled ? [{ name: 'unload', label: actionLabel }] : undefined}
            onAccessibilityAction={() => onUnload()}
          >
            {children}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
