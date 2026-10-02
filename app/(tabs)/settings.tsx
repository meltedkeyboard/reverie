import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'

import { ChipGroup } from '@/components/ChipGroup'
import { loadModel } from '@/api/llm'
import { Flash } from '@/components/Flash'
import { GlassHeader, TabTitle, useHeaderHeight, useScreenPadding } from '@/components/GlassHeader'
import { Divider } from '@/components/motifs/Divider'
import { FieldRow } from '@/components/motifs/FieldRow'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import type { MenuItem } from '@/components/NativeMenu'
import { ParamSlider } from '@/components/ParamSlider'
import { PillButton } from '@/components/PillButton'
import { ToggleRow } from '@/components/ToggleRow'
import { isAppLockEnabled, setAppLockEnabled } from '@/db/appLock'
import { isConfirmDeleteEnabled, setConfirmDeleteEnabled } from '@/db/confirmDelete'
import { isContinueByVisit, isContinueEnabled, setContinueByVisit, setContinueEnabled } from '@/db/continue'
import { isHapticsEnabled, setHapticsEnabled } from '@/db/haptics'
import { isPrivateChatEnabled, setPrivateChatEnabled } from '@/db/privateChat'
import { useDatabase, useShowInFiles } from '@/db/provider'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ServerSettings } from '@/db/settings'
import { isSuggestionsEnabled, setSuggestionsEnabled } from '@/db/suggestions'
import { useCloudSync } from '@/hooks/useCloudSync'
import { useConnectionTest } from '@/hooks/useConnectionTest'
import { useStoredFlag } from '@/hooks/useStoredFlag'
import { useTranslation, type LocalePreference } from '@/i18n'
import { CHAT_MESSAGES, CONTEXT_STEPS, ROOM_MESSAGES, type ContextMode } from '@/lib/context'
import { exportBackup, importBackup, wipeAllData } from '@/lib/backup'
import { alternateIconsAvailable, currentAppIcon } from '@/lib/appIcons'
import { confirm } from '@/lib/dialogs'
import { showToast } from '@/lib/toast'
import { useChatTextSettings } from '@/lib/chatText'
import { errorMessage } from '@/lib/errors'
import { formatWhen } from '@/lib/format'
import { notificationAsync, NotificationFeedbackType } from '@/lib/haptics'
import type { SettingsSection } from '@/lib/searchScope'
import { isShownInFiles } from '@/lib/storage'
import { useColors, useStyles, useTheme, type Colors, type ThemePreference } from '@/theme'

const android = Platform.OS === 'android'

export default function SettingsScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const { preference, setPreference } = useTheme()
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
  const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('theme.system') },
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
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

  const [cfg, setCfg] = useState<ServerSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const { status, models, test, reset: resetStatus } = useConnectionTest()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const backingUp = exporting || importing
  const [wiping, setWiping] = useState(false)
  const [continueButton, toggleContinueButton] = useStoredFlag(isContinueEnabled, setContinueEnabled, true)
  const [continueByVisit, setContinueByVisitValue] = useStoredFlag(isContinueByVisit, setContinueByVisit, true)
  const [privateButton, togglePrivateButton] = useStoredFlag(isPrivateChatEnabled, setPrivateChatEnabled, true)
  const [suggestions, toggleSuggestions] = useStoredFlag(isSuggestionsEnabled, setSuggestionsEnabled, false)
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
      showToast({ tone: 'error', title: t('settings.showInFilesFailedTitle'), message: errorMessage(err) })
    } finally {
      setMovingFiles(false)
    }
  }

  const cloudSync = useCloudSync()
  // Expo Go has no iCloud module. In development the section is still shown there, with
  // its buttons out and pretending to work, so the layout and animations can be looked at.
  const cloudPreview = __DEV__ && !cloudSync.available

  const toggleCloudSync = async (on: boolean) => {
    try {
      if (on) await cloudSync.enable()
      else await cloudSync.disable()
    } catch (err) {
      showToast({ tone: 'error', title: t('sync.failedTitle'), message: errorMessage(err) })
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
    cloudSync.folder ? t('settings.icloudFolder', { folder: cloudSync.folder }) : t('settings.icloudNoFolder'),
    cloudSync.syncedAt ? t('settings.icloudSyncedAt', { when: formatWhen(cloudSync.syncedAt, locale) }) : null,
  ]
    .filter(Boolean)
    .join('\n')

  const toggleAppLock = async (enabled: boolean) => {
    if (enabled) {
      // Verify it works before turning it on, so the app can't lock the user out.
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
        showToast({
          tone: 'error',
          title: t(android ? 'settings.requireBiometrics' : 'settings.requireFaceId'),
          message: t(`settings.${android ? 'biometricsUnavailable' : 'faceIdUnavailable'}`),
        })
        return
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })
      if (!result.success) return
    }
    setAppLock(enabled)
  }

  useEffect(() => {
    loadSettings(db).then((stored) => {
      setCfg(stored)
      setLoaded(true)
    })
  }, [db])

  useEffect(() => {
    if (loaded) saveSettings(db, cfg)
  }, [db, cfg, loaded])

  // The context slider shows once the model is loaded; another server or model starts over.
  const [loadingModel, setLoadingModel] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)

  const update = (patch: Partial<ServerSettings>) => {
    setCfg((prev) => ({ ...prev, ...patch }))
    if (patch.baseUrl !== undefined || patch.apiKey !== undefined) resetStatus()
    if (patch.baseUrl !== undefined || patch.apiKey !== undefined || patch.model !== undefined) setModelLoaded(false)
  }

  const onLoadModel = async () => {
    setLoadingModel(true)
    try {
      await loadModel(cfg)
      setModelLoaded(true)
      notificationAsync(NotificationFeedbackType.Success)
    } catch (err) {
      notificationAsync(NotificationFeedbackType.Error)
      showToast({ tone: 'error', title: t('settings.loadModelFailed'), message: errorMessage(err) })
    } finally {
      setLoadingModel(false)
    }
  }

  // The models the server lists are picked from a system menu, the chosen one checked.
  const modelItems = (list: string[]): MenuItem[] =>
    list.map((id) => ({
      label: id,
      systemImage: id === cfg.model ? 'checkmark' : undefined,
      onSelect: () => update({ model: id }),
    }))

  // One model alone is taken as it is; out of several the user picks from the field.
  const onTest = async () => {
    const found = await test(cfg)
    if (found.length === 1 && !found.includes(cfg.model)) update({ model: found[0] })
  }

  const onExport = async () => {
    setExporting(true)
    try {
      const saved = await exportBackup(db)
      if (saved) {
        showToast({
          tone: 'success',
          title: t('settings.exportDoneTitle'),
          message: t('settings.exportDoneMessage', { name: saved.name, folder: saved.folder }),
        })
      }
    } catch (err) {
      showToast({ tone: 'error', title: t('settings.exportFailedTitle'), message: errorMessage(err) })
    } finally {
      setExporting(false)
    }
  }

  const onImport = async () => {
    setImporting(true)
    try {
      const result = await importBackup(db)
      if (result) {
        showToast({
          tone: 'success',
          title: t('settings.importDoneTitle'),
          message: t('settings.importDoneMessage', { count: result.characters }),
        })
      }
    } catch (err) {
      showToast({ tone: 'error', title: t('settings.importFailedTitle'), message: errorMessage(err) })
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
          showToast({ tone: 'error', title: t('settings.wipeFailedTitle'), message: errorMessage(err) })
        } finally {
          setWiping(false)
        }
      },
    })
  }

  const appearance = (
    <>
      <Eyebrow label={t('settings.appearance')} color={colors.text} />
      <ChipGroup options={THEME_OPTIONS} value={preference} onChange={setPreference} />
    </>
  )

  const language = (
    <>
      <Eyebrow label={t('settings.language')} color={colors.text} />
      <ChipGroup options={LANGUAGE_OPTIONS} value={localePreference} onChange={setLocalePreference} />
    </>
  )

  // The row that opens the app icon picker; the picker needs a build with the native module.
  const [appIcon, setAppIconName] = useState(currentAppIcon)
  useFocusEffect(useCallback(() => setAppIconName(currentAppIcon()), []))
  const appIconRows = alternateIconsAvailable ? (
    <>
      <Eyebrow label={t('settings.appIcon')} color={colors.text} />
      <Pressable onPress={() => router.push('/app-icon')} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}>
        <Text style={[styles.rowLabel, styles.linkLabel]}>{t(`appIcon.${appIcon ?? 'default'}`)}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </>
  ) : null

  const continueRows = (
    <>
      <ToggleRow
        label={t('settings.continueButton')}
        note={t('settings.continueButtonNote')}
        value={continueButton}
        onValueChange={toggleContinueButton}
      />
      {continueButton ? (
        <ChipGroup
          options={CONTINUE_OPTIONS}
          value={continueByVisit ? 'visit' : 'message'}
          onChange={(v) => setContinueByVisitValue(v === 'visit')}
          style={styles.chips}
        />
      ) : null}
    </>
  )

  const suggestRow = (
    <>
      <ToggleRow
        label={t('settings.suggestButton')}
        note={t('settings.suggestButtonNote')}
        value={suggestions}
        onValueChange={toggleSuggestions}
      />
    </>
  )

  const privateRow = (
    <ToggleRow
      label={t('settings.privateButton')}
      note={t('settings.privateButtonNote')}
      value={privateButton}
      onValueChange={togglePrivateButton}
    />
  )

  const confirmDeleteRow = (
    <ToggleRow
      label={t('settings.confirmDelete')}
      note={t('settings.confirmDeleteNote')}
      value={confirmDelete}
      onValueChange={toggleConfirmDelete}
    />
  )

  const chatText = useChatTextSettings()
  const chatTextRows = (
    <Pressable onPress={() => router.push('/chat-text')} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}>
      <View style={styles.linkText}>
        <Text style={[styles.rowLabel, styles.linkLabel]}>{t('settings.chatFont')}</Text>
        <Text style={styles.linkValue}>
          {chatText.font === 'System' ? t('chatFont.system') : chatText.font}, {Math.round(chatText.scale * 100)}%
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )

  const hapticsRow = (
    <ToggleRow label={t('settings.haptics')} note={t('settings.hapticsNote')} value={haptics} onValueChange={toggleHaptics} />
  )

  const faceIdRow = (
    <ToggleRow
      label={t(android ? 'settings.requireBiometrics' : 'settings.requireFaceId')}
      note={t(android ? 'settings.requireBiometricsNote' : 'settings.requireFaceIdNote')}
      value={appLock}
      onValueChange={toggleAppLock}
    />
  )

  const filesRow = (
    <ToggleRow
      label={t('settings.showInFiles')}
      note={t('settings.showInFilesNote')}
      value={showInFiles}
      onValueChange={toggleShowInFiles}
      disabled={movingFiles}
    />
  )

  const server = (
    <>
      <Eyebrow label={t('settings.server')} color={colors.text} />
      <FieldRow
        star={false}
        label={t('settings.baseUrlLabel')}
        hint={t('settings.baseUrlHint')}
        value={cfg.baseUrl}
        onChangeText={(baseUrl) => update({ baseUrl })}
        placeholder={t('settings.baseUrlPlaceholder')}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FieldRow
        star={false}
        label={t('settings.apiKeyLabel')}
        hint={t('settings.apiKeyHint')}
        value={cfg.apiKey}
        onChangeText={(apiKey) => update({ apiKey })}
        placeholder={t('settings.apiKeyPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      {/* Typed by hand until the server has listed its models, then picked from them. */}
      {models.length > 0 ? (
        <FieldRow
          star={false}
          label={t('settings.modelLabel')}
          value={models.includes(cfg.model) ? cfg.model : ''}
          placeholder={t('onboarding.pickModel')}
          menu={modelItems(models)}
        />
      ) : (
        <FieldRow
          star={false}
          label={t('settings.modelLabel')}
          value={cfg.model}
          onChangeText={(model) => update({ model })}
          placeholder={t('settings.modelPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      <View style={styles.testRow}>
        <PillButton label={t('settings.testConnection')} onPress={onTest} loading={status.kind === 'testing'} style={styles.testButton} />
        <PillButton
          accessibilityLabel={t('settings.loadModel')}
          icon={{ name: 'play.fill', fallback: 'play' }}
          onPress={onLoadModel}
          loading={loadingModel}
          disabled={!cfg.baseUrl.trim() || !cfg.model.trim()}
        />
      </View>

      <Eyebrow label={t('settings.contextLabel')} color={colors.text} />
      <ChipGroup
        options={CONTEXT_OPTIONS}
        value={cfg.contextMode}
        onChange={(contextMode) => update({ contextMode })}
      />
      {cfg.contextMode === 'messages' ? (
        <Text style={styles.contextHint}>{t('settings.contextMessagesHint', { chat: CHAT_MESSAGES, room: ROOM_MESSAGES })}</Text>
      ) : null}

      {cfg.contextMode === 'tokens' && modelLoaded ? (
        <>
          {/* A step of the slider, not a token count: the sizes models come in are doublings. */}
          <ParamSlider
            label={t('settings.contextTokensLabel')}
            value={Math.max(0, CONTEXT_STEPS.indexOf(cfg.contextTokens as (typeof CONTEXT_STEPS)[number]))}
            min={0}
            max={CONTEXT_STEPS.length - 1}
            step={1}
            formatValue={(i) => `${CONTEXT_STEPS[i] / 1024}K`}
            onChange={(i) => update({ contextTokens: CONTEXT_STEPS[i] })}
          />
          <Text style={styles.contextHint}>{t('settings.contextHint')}</Text>
        </>
      ) : null}

      {status.kind === 'ok' || status.kind === 'error' ? <Text style={styles.statusText}>{status.text}</Text> : null}
    </>
  )

  const showCloud = cloudSync.available || cloudPreview
  const icloud = (
    <>
      <Eyebrow label={t('settings.icloud')} color={colors.text} />
      <ToggleRow
        label={t('settings.icloudSync')}
        note={t('settings.icloudSyncNote')}
        value={cloudSync.enabled}
        onValueChange={toggleCloudSync}
        disabled={cloudSync.syncing || cloudAction !== null || backingUp}
      />
      {cloudSync.enabled || cloudPreview ? (
        <>
          <Text style={styles.note}>{cloudStatus}</Text>
          <View style={styles.buttonPairRow}>
            <PillButton
              filled
              label={t('settings.icloudPush')}
              icon={{ name: 'arrow.up', fallback: 'arrow-up', slide: 'up' }}
              onPress={() => runCloud('push', cloudSync.pushNow)}
              loading={cloudAction === 'push'}
              disabled={cloudSync.syncing || cloudAction === 'pull' || backingUp}
              style={styles.pairButton}
            />
            <PillButton
              filled
              label={t('settings.icloudPull')}
              icon={{ name: 'arrow.down', fallback: 'arrow-down', slide: 'down' }}
              onPress={() => runCloud('pull', cloudSync.pullNow)}
              loading={cloudAction === 'pull'}
              disabled={cloudSync.syncing || cloudAction === 'push' || backingUp}
              style={styles.pairButton}
            />
            <PillButton
              accessibilityLabel={t('settings.icloudChangeFolder')}
              icon={{ name: 'folder', fallback: 'folder-outline' }}
              onPress={() => cloudSync.changeFolder().catch((err) => showToast({ tone: 'error', title: t('sync.failedTitle'), message: errorMessage(err) }))}
              disabled={cloudSync.syncing || cloudAction !== null || backingUp}
            />
          </View>
        </>
      ) : null}
    </>
  )

  const backup = (
    <>
      <Eyebrow label={t('settings.backupTitle')} color={colors.text} />
      <Text style={styles.note}>{t('settings.backupNote')}</Text>
      <View style={styles.buttonPairRow}>
        <PillButton filled label={t('settings.exportJson')} onPress={onExport} loading={exporting} disabled={exporting || cloudAction !== null} style={styles.pairButton} />
        <PillButton
          filled
          label={t('settings.importJson')}
          onPress={onImport}
          loading={importing}
          disabled={importing || cloudAction !== null}
          style={styles.pairButton}
        />
      </View>
    </>
  )

  const aboutRow = (
    <Pressable onPress={() => router.push('/about')} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.rowLabel, styles.linkLabel]}>{t('settings.aboutReverie')}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )

  const wipe = (
    <>
      <Eyebrow label={t('settings.dangerZone')} color={colors.danger} />
      <Text style={styles.note}>{t('settings.dangerNote')}</Text>
      <PillButton filled label={t('settings.wipeAll')} onPress={onWipe} loading={wiping} disabled={wiping} color={colors.danger} />
    </>
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
          {block('appearance', appearance, styles.chips)}
          {block('language', language, styles.chips)}
          {appIconRows ? block('appIcon', appIconRows) : null}

          <Divider />

          <Eyebrow label={t('settings.homeScreen')} color={colors.text} />
          {block('continue', continueRows)}

          <Divider />

          <Eyebrow label={t('settings.chats')} color={colors.text} />
          {block('private', privateRow)}
          {block('suggest', suggestRow)}
          {block('confirmDelete', confirmDeleteRow)}
          {block('chatText', chatTextRows)}

          <Divider />

          <Eyebrow label={t('settings.feedback')} color={colors.text} />
          {block('haptics', hapticsRow)}

          <Divider />

          <Eyebrow label={t('settings.security')} color={colors.text} />
          {block('faceId', faceIdRow)}
          {android ? null : block('files', filesRow)}

          <Divider />

          {block('server', server)}

          <Divider />

          {showCloud ? (
            <>
              {block('icloud', icloud)}
              <Divider />
            </>
          ) : null}

          {block('backup', backup)}

          <Divider />

          <Eyebrow label={t('settings.aboutTitle')} color={colors.text} />
          {aboutRow}

          <Divider />

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
    chips: { marginBottom: 16 },
    // Reaches a little past the block, so the tint frames it instead of hugging the text.
    flash: { top: -8, bottom: -8, left: -10, right: -10, borderRadius: 16 },
    rowLabel: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
    testRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    testButton: { flex: 1 },
    contextHint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 10, marginBottom: 4 },
    statusText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 12 },
    buttonPairRow: { flexDirection: 'row', gap: 12 },
    pairButton: { flex: 1 },
    linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    linkLabel: { marginBottom: 0 },
    linkText: { flex: 1 },
    linkValue: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
    chevron: { color: colors.textFaint, fontSize: 20 },
  })
