import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'

import { ChipGroup } from '@/components/ChipGroup'
import { Flash } from '@/components/Flash'
import { GlassHeader, TabTitle, useHeaderHeight, useScreenPadding } from '@/components/GlassHeader'
import { Divider } from '@/components/motifs/Divider'
import { FieldRow } from '@/components/motifs/FieldRow'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import { ModelSheet } from '@/components/ModelSheet'
import { PillButton } from '@/components/PillButton'
import { SettingsWheel, type WheelItem } from '@/components/SettingsWheel'
import { ToggleRow } from '@/components/ToggleRow'
import { isAppLockEnabled, setAppLockEnabled } from '@/db/appLock'
import { isConfirmDeleteEnabled, setConfirmDeleteEnabled } from '@/db/confirmDelete'
import { isContinueByVisit, isContinueEnabled, setContinueByVisit, setContinueEnabled } from '@/db/continue'
import { isHapticsEnabled, setHapticsEnabled } from '@/db/haptics'
import { isPrivateChatEnabled, setPrivateChatEnabled } from '@/db/privateChat'
import { useDatabase, useShowInFiles } from '@/db/provider'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ServerSettings } from '@/db/settings'
import { useCloudSync } from '@/hooks/useCloudSync'
import { useConnectionTest } from '@/hooks/useConnectionTest'
import { useShake } from '@/hooks/useShake'
import { useStoredFlag } from '@/hooks/useStoredFlag'
import { useTranslation, type LocalePreference } from '@/i18n'
import { exportBackup, importBackup, wipeAllData } from '@/lib/backup'
import { confirm, showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import { formatWhen } from '@/lib/format'
import { notificationAsync, NotificationFeedbackType } from '@/lib/haptics'
import type { SettingsSection } from '@/lib/searchScope'
import { isShownInFiles } from '@/lib/storage'
import { useColors, useStyles, useTheme, type Colors, type ThemePreference } from '@/theme'

// An easter egg: shaking the phone hard on this tab turns the settings into cards on a
// wheel, and shaking it again brings the list back. Harder and longer than the shake on
// the About screen, so it does not come up by chance.
const WHEEL_SHAKE = { threshold: 2.8, jolts: 4 }

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

  // Listens only while the tab is in front: not under About, which has a shake of its own.
  const [focused, setFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, [])
  )
  const [wheel, setWheel] = useState(false)
  const toggleWheel = useCallback(() => {
    notificationAsync(NotificationFeedbackType.Success)
    setWheel((on) => !on)
  }, [])
  useShake(toggleWheel, focused, WHEEL_SHAKE)

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
  const [pickingModel, setPickingModel] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const backingUp = exporting || importing
  const [wiping, setWiping] = useState(false)
  const [continueButton, toggleContinueButton] = useStoredFlag(isContinueEnabled, setContinueEnabled, true)
  const [continueByVisit, setContinueByVisitValue] = useStoredFlag(isContinueByVisit, setContinueByVisit, true)
  const [privateButton, togglePrivateButton] = useStoredFlag(isPrivateChatEnabled, setPrivateChatEnabled, true)
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
      showMessage(t('settings.showInFilesFailedTitle'), errorMessage(err))
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
      showMessage(t('sync.failedTitle'), errorMessage(err))
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
        showMessage(t('settings.requireFaceId'), t('settings.faceIdUnavailable'))
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

  const update = (patch: Partial<ServerSettings>) => {
    setCfg((prev) => ({ ...prev, ...patch }))
    if (patch.baseUrl !== undefined || patch.apiKey !== undefined) resetStatus()
  }

  // The models the server lists are picked from a sheet; one alone is taken as it is.
  const onTest = async () => {
    const found = await test(cfg)
    if (found.includes(cfg.model)) return
    if (found.length === 1) update({ model: found[0] })
    else if (found.length > 1) setPickingModel(true)
  }

  const onExport = async () => {
    setExporting(true)
    try {
      const saved = await exportBackup(db)
      if (saved) showMessage(t('settings.exportDoneTitle'), t('settings.exportDoneMessage', { name: saved.name, folder: saved.folder }))
    } catch (err) {
      showMessage(t('settings.exportFailedTitle'), errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const onImport = async () => {
    setImporting(true)
    try {
      const result = await importBackup(db)
      if (result) showMessage(t('settings.importDoneTitle'), t('settings.importDoneMessage', { count: result.characters }))
    } catch (err) {
      showMessage(t('settings.importFailedTitle'), errorMessage(err))
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
          showMessage(t('settings.wipeFailedTitle'), errorMessage(err))
        } finally {
          setWiping(false)
        }
      },
    })
  }

  // The sections, laid out either as the plain list or as the wheel below.
  const appearance = (
    <>
      <Eyebrow label={t('settings.appearance')} color={colors.accent} />
      <ChipGroup options={THEME_OPTIONS} value={preference} onChange={setPreference} />
    </>
  )

  const language = (
    <>
      <Eyebrow label={t('settings.language')} color={colors.accent} />
      <ChipGroup options={LANGUAGE_OPTIONS} value={localePreference} onChange={setLocalePreference} />
    </>
  )

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

  const hapticsRow = (
    <ToggleRow label={t('settings.haptics')} note={t('settings.hapticsNote')} value={haptics} onValueChange={toggleHaptics} />
  )

  const faceIdRow = (
    <ToggleRow
      label={t('settings.requireFaceId')}
      note={t('settings.requireFaceIdNote')}
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
      <Eyebrow label={t('settings.server')} color={colors.accent} />
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
          onPress={() => setPickingModel(true)}
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

      <PillButton label={t('settings.testConnection')} onPress={onTest} loading={status.kind === 'testing'} style={styles.testButton} />

      {status.kind === 'ok' || status.kind === 'error' ? <Text style={styles.statusText}>{status.text}</Text> : null}
    </>
  )

  const showCloud = cloudSync.available || cloudPreview
  const icloud = (
    <>
      <Eyebrow label={t('settings.icloud')} color={colors.accent} />
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
              onPress={() => cloudSync.changeFolder().catch((err) => showMessage(t('sync.failedTitle'), errorMessage(err)))}
              disabled={cloudSync.syncing || cloudAction !== null || backingUp}
            />
          </View>
        </>
      ) : null}
    </>
  )

  const backup = (
    <>
      <Eyebrow label={t('settings.backupTitle')} color={colors.accent} />
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

  const wheelItems: WheelItem[] = [
    { key: 'appearance', sections: ['appearance'], content: block('appearance', appearance) },
    { key: 'language', sections: ['language'], content: block('language', language) },
    {
      key: 'home',
      sections: ['continue'],
      content: (
        <>
          <Eyebrow label={t('settings.homeScreen')} color={colors.accent} />
          {block('continue', continueRows)}
        </>
      ),
    },
    {
      key: 'chats',
      sections: ['private', 'confirmDelete'],
      content: (
        <>
          <Eyebrow label={t('settings.chats')} color={colors.accent} />
          {block('private', privateRow)}
          {block('confirmDelete', confirmDeleteRow)}
        </>
      ),
    },
    {
      key: 'feedback',
      sections: ['haptics'],
      content: (
        <>
          <Eyebrow label={t('settings.feedback')} color={colors.accent} />
          {block('haptics', hapticsRow)}
        </>
      ),
    },
    {
      key: 'security',
      sections: ['faceId', 'files'],
      content: (
        <>
          <Eyebrow label={t('settings.security')} color={colors.accent} />
          {block('faceId', faceIdRow)}
          {block('files', filesRow)}
        </>
      ),
    },
    { key: 'server', sections: ['server'], content: block('server', server) },
    ...(showCloud ? [{ key: 'icloud', sections: ['icloud'], content: block('icloud', icloud) }] : []),
    { key: 'backup', sections: ['backup'], content: block('backup', backup) },
    {
      key: 'about',
      sections: [],
      content: (
        <>
          <Eyebrow label={t('settings.aboutTitle')} color={colors.accent} />
          {aboutRow}
        </>
      ),
    },
    { key: 'wipe', sections: ['wipe'], content: block('wipe', wipe) },
  ]

  return (
    <View style={styles.screen}>
      {loaded && wheel ? <SettingsWheel items={wheelItems} focus={flashed} /> : null}

      {loaded && !wheel ? (
        <KeyboardAwareScrollView
          ref={scrollRef}
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
        >
          {block('appearance', appearance, styles.chips)}
          {block('language', language, styles.chips)}

          <Divider />

          <Eyebrow label={t('settings.homeScreen')} color={colors.accent} />
          {block('continue', continueRows)}

          <Divider />

          <Eyebrow label={t('settings.chats')} color={colors.accent} />
          {block('private', privateRow)}
          {block('confirmDelete', confirmDeleteRow)}

          <Divider />

          <Eyebrow label={t('settings.feedback')} color={colors.accent} />
          {block('haptics', hapticsRow)}

          <Divider />

          <Eyebrow label={t('settings.security')} color={colors.accent} />
          {block('faceId', faceIdRow)}
          {block('files', filesRow)}

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

          <Eyebrow label={t('settings.aboutTitle')} color={colors.accent} />
          {aboutRow}

          <Divider />

          {block('wipe', wipe)}
        </KeyboardAwareScrollView>
      ) : null}

      <GlassHeader floating>
        <TabTitle>{t('settings.title')}</TabTitle>
      </GlassHeader>

      <ModelSheet
        visible={pickingModel}
        onClose={() => setPickingModel(false)}
        models={models}
        selected={cfg.model}
        onSelect={(model) => update({ model })}
      />
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
    testButton: { alignSelf: 'stretch' },
    statusText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 12 },
    buttonPairRow: { flexDirection: 'row', gap: 12 },
    pairButton: { flex: 1 },
    linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    linkLabel: { marginBottom: 0 },
    chevron: { color: colors.textFaint, fontSize: 20 },
  })
