import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'

import { ChipGroup } from '@/components/ChipGroup'
import { Flash } from '@/components/Flash'
import { GlassHeader, TabTitle, useHeaderHeight, useScreenPadding } from '@/components/GlassHeader'
import { Divider } from '@/components/motifs/Divider'
import { FieldRow } from '@/components/motifs/FieldRow'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import { PillButton } from '@/components/PillButton'
import { Chip } from '@/components/Chip'
import { Star } from '@/components/motifs/Star'
import { ToggleRow } from '@/components/ToggleRow'
import { isAppLockEnabled, setAppLockEnabled } from '@/db/appLock'
import { isConfirmDeleteEnabled, setConfirmDeleteEnabled } from '@/db/confirmDelete'
import { isContinueByVisit, isContinueEnabled, setContinueByVisit, setContinueEnabled } from '@/db/continue'
import { isHapticsEnabled, setHapticsEnabled } from '@/db/haptics'
import { isPrivateChatEnabled, setPrivateChatEnabled } from '@/db/privateChat'
import { useDatabase, useShowInFiles } from '@/db/provider'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ServerSettings } from '@/db/settings'
import { useConnectionTest } from '@/hooks/useConnectionTest'
import { useStoredFlag } from '@/hooks/useStoredFlag'
import { useTranslation, type LocalePreference } from '@/i18n'
import { exportBackup, importBackup, wipeAllData } from '@/lib/backup'
import { confirm, showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import type { SettingsSection } from '@/lib/searchScope'
import { isShownInFiles } from '@/lib/storage'
import { useColors, useStyles, useTheme, type Colors, type ThemePreference } from '@/theme'

export default function SettingsScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const { preference, setPreference } = useTheme()
  const styles = useStyles(createStyles)
  const { t, preference: localePreference, setPreference: setLocalePreference } = useTranslation()
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
  const { status, models, test } = useConnectionTest()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
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

  const update = (patch: Partial<ServerSettings>) => setCfg((prev) => ({ ...prev, ...patch }))

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
          {block(
            'appearance',
            <>
              <Eyebrow label={t('settings.appearance')} color={colors.accent} />
              <ChipGroup options={THEME_OPTIONS} value={preference} onChange={setPreference} />
            </>,
            styles.chips
          )}

          {block(
            'language',
            <>
              <Eyebrow label={t('settings.language')} color={colors.accent} />
              <ChipGroup options={LANGUAGE_OPTIONS} value={localePreference} onChange={setLocalePreference} />
            </>,
            styles.chips
          )}

          <Divider />

          <Eyebrow label={t('settings.homeScreen')} color={colors.accent} />
          {block(
            'continue',
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
          )}

          <Divider />

          <Eyebrow label={t('settings.chats')} color={colors.accent} />
          {block(
            'private',
            <ToggleRow
              label={t('settings.privateButton')}
              note={t('settings.privateButtonNote')}
              value={privateButton}
              onValueChange={togglePrivateButton}
            />
          )}
          {block(
            'confirmDelete',
            <ToggleRow
              label={t('settings.confirmDelete')}
              note={t('settings.confirmDeleteNote')}
              value={confirmDelete}
              onValueChange={toggleConfirmDelete}
            />
          )}

          <Divider />

          <Eyebrow label={t('settings.feedback')} color={colors.accent} />
          {block(
            'haptics',
            <ToggleRow
              label={t('settings.haptics')}
              note={t('settings.hapticsNote')}
              value={haptics}
              onValueChange={toggleHaptics}
            />
          )}

          <Divider />

          {Platform.OS !== 'web' ? (
            <>
              <Eyebrow label={t('settings.security')} color={colors.accent} />
              {block(
                'faceId',
                <ToggleRow
                  label={t('settings.requireFaceId')}
                  note={t('settings.requireFaceIdNote')}
                  value={appLock}
                  onValueChange={toggleAppLock}
                />
              )}
              {block(
                'files',
                <ToggleRow
                  label={t('settings.showInFiles')}
                  note={t('settings.showInFilesNote')}
                  value={showInFiles}
                  onValueChange={toggleShowInFiles}
                  disabled={movingFiles}
                />
              )}

              <Divider />
            </>
          ) : null}

          {block(
            'server',
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
              <FieldRow
                star={false}
                label={t('settings.modelLabel')}
                value={cfg.model}
                onChangeText={(model) => update({ model })}
                placeholder={t('settings.modelPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {models.length > 0 ? (
                <View style={[styles.chipsRow, styles.modelChips]}>
                  {models.map((id) => (
                    <Chip key={id} label={id} active={id === cfg.model} onPress={() => update({ model: id })} />
                  ))}
                </View>
              ) : null}

              <PillButton label={t('settings.testConnection')} onPress={() => test(cfg)} loading={status.kind === 'testing'} style={styles.testButton} />

              {status.kind === 'ok' || status.kind === 'error' ? <Text style={styles.statusText}>{status.text}</Text> : null}
            </>
          )}

          <Divider />

          {block(
            'backup',
            <>
              <Eyebrow label={t('settings.backupTitle')} color={colors.accent} />
              <Text style={styles.note}>{t('settings.backupNote')}</Text>
              <View style={styles.buttonPairRow}>
                <PillButton label={t('settings.exportJson')} onPress={onExport} loading={exporting} disabled={exporting} style={styles.pairButton} />
                <PillButton
                  label={t('settings.importJson')}
                  onPress={onImport}
                  loading={importing}
                  disabled={importing}
                  style={styles.pairButton}
                />
              </View>
            </>
          )}

          <Divider />

          <Eyebrow label={t('settings.aboutTitle')} color={colors.accent} />
          <Pressable
            onPress={() => router.push('/about')}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.rowLabel, styles.linkLabel]}>{t('settings.aboutReverie')}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <Divider />

          {block(
            'wipe',
            <>
              <Eyebrow label={t('settings.dangerZone')} color={colors.danger} />
              <Text style={styles.note}>{t('settings.dangerNote')}</Text>
              <PillButton label={t('settings.wipeAll')} onPress={onWipe} loading={wiping} disabled={wiping} color={colors.danger} />
            </>
          )}

          <View style={styles.footer}>
            <Star size={14} color={colors.textFaint} filled={false} rotation={12} strokeWidth={70} />
          </View>
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
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    modelChips: { marginTop: -4 },
    rowLabel: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
    testButton: { alignSelf: 'flex-start' },
    statusText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 12 },
    buttonPairRow: { flexDirection: 'row', gap: 12 },
    pairButton: { flex: 1 },
    linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    linkLabel: { marginBottom: 0 },
    chevron: { color: colors.textFaint, fontSize: 20 },
    footer: { alignItems: 'center', marginTop: 32 },
  })
