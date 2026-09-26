import { useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useState } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { ChipGroup } from '@/components/ChipGroup'
import { FormScreenHeader } from '@/components/FormScreenHeader'
import { useScreenPadding } from '@/components/GlassHeader'
import { Divider } from '@/components/motifs/Divider'
import { FieldRow } from '@/components/motifs/FieldRow'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import { ShardButton } from '@/components/motifs/ShardButton'
import { ShardChip } from '@/components/motifs/ShardChip'
import { Star } from '@/components/motifs/Star'
import { ToggleRow } from '@/components/ToggleRow'
import { isAppLockEnabled, setAppLockEnabled } from '@/db/appLock'
import { isConfirmDeleteEnabled, setConfirmDeleteEnabled } from '@/db/confirmDelete'
import { isContinueEnabled, setContinueEnabled } from '@/db/continue'
import { isHapticsEnabled, setHapticsEnabled } from '@/db/haptics'
import { isPrivateChatEnabled, setPrivateChatEnabled } from '@/db/privateChat'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ServerSettings } from '@/db/settings'
import { useConnectionTest } from '@/hooks/useConnectionTest'
import { useStoredFlag } from '@/hooks/useStoredFlag'
import { useTranslation, type LocalePreference } from '@/i18n'
import { exportBackup, importBackup, wipeAllData } from '@/lib/backup'
import { confirm, showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import { isShownInFiles, isStoragePending, setShownInFiles } from '@/lib/storage'
import { useColors, useStyles, useTheme, type Colors, type ThemePreference } from '@/theme'

export default function SettingsScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const { preference, setPreference } = useTheme()
  const styles = useStyles(createStyles)
  const { t, preference: localePreference, setPreference: setLocalePreference } = useTranslation()

  const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('theme.system') },
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
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
  const [privateButton, togglePrivateButton] = useStoredFlag(isPrivateChatEnabled, setPrivateChatEnabled, true)
  const [confirmDelete, toggleConfirmDelete] = useStoredFlag(isConfirmDeleteEnabled, setConfirmDeleteEnabled, true)
  const [haptics, toggleHaptics] = useStoredFlag(isHapticsEnabled, setHapticsEnabled, true)
  const [appLock, setAppLock] = useStoredFlag(isAppLockEnabled, setAppLockEnabled, false)

  const [showInFiles, setShowInFiles] = useState(isShownInFiles)

  const toggleShowInFiles = (shown: boolean) => {
    setShowInFiles(shown)
    setShownInFiles(shown)
    // The database can't move while it is open, so the files change place on the next launch.
    if (isStoragePending()) showMessage(t('settings.showInFilesRestartTitle'), t('settings.showInFilesRestartMessage'))
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
          router.dismissTo('/')
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
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
        >
          <Eyebrow label={t('settings.appearance')} color={colors.accent} />
          <ChipGroup style={styles.chips} options={THEME_OPTIONS} value={preference} onChange={setPreference} />

          <Eyebrow label={t('settings.language')} color={colors.accent} />
          <ChipGroup style={styles.chips} options={LANGUAGE_OPTIONS} value={localePreference} onChange={setLocalePreference} />

          <Divider />

          <Eyebrow label={t('settings.homeScreen')} color={colors.accent} />
          <ToggleRow
            label={t('settings.continueButton')}
            note={t('settings.continueButtonNote')}
            value={continueButton}
            onValueChange={toggleContinueButton}
          />

          <Divider />

          <Eyebrow label={t('settings.chats')} color={colors.accent} />
          <ToggleRow
            label={t('settings.privateButton')}
            note={t('settings.privateButtonNote')}
            value={privateButton}
            onValueChange={togglePrivateButton}
          />
          <ToggleRow
            label={t('settings.confirmDelete')}
            note={t('settings.confirmDeleteNote')}
            value={confirmDelete}
            onValueChange={toggleConfirmDelete}
          />

          <Divider />

          <Eyebrow label={t('settings.feedback')} color={colors.accent} />
          <ToggleRow
            label={t('settings.haptics')}
            note={t('settings.hapticsNote')}
            value={haptics}
            onValueChange={toggleHaptics}
          />

          <Divider />

          {Platform.OS !== 'web' ? (
            <>
              <Eyebrow label={t('settings.security')} color={colors.accent} />
              <ToggleRow
                label={t('settings.requireFaceId')}
                note={t('settings.requireFaceIdNote')}
                value={appLock}
                onValueChange={toggleAppLock}
              />
              <ToggleRow
                label={t('settings.showInFiles')}
                note={t('settings.showInFilesNote')}
                value={showInFiles}
                onValueChange={toggleShowInFiles}
              />

              <Divider />
            </>
          ) : null}

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
                <ShardChip key={id} label={id} active={id === cfg.model} onPress={() => update({ model: id })} />
              ))}
            </View>
          ) : null}

          <ShardButton label={t('settings.testConnection')} onPress={() => test(cfg)} loading={status.kind === 'testing'} style={styles.testButton} />

          {status.kind === 'ok' || status.kind === 'error' ? <Text style={styles.statusText}>{status.text}</Text> : null}

          <Divider />

          <Eyebrow label={t('settings.backupTitle')} color={colors.accent} />
          <Text style={styles.note}>{t('settings.backupNote')}</Text>
          <View style={styles.buttonPairRow}>
            <ShardButton label={t('settings.exportJson')} onPress={onExport} loading={exporting} disabled={exporting} style={styles.pairButton} />
            <ShardButton
              label={t('settings.importJson')}
              onPress={onImport}
              loading={importing}
              disabled={importing}
              flip
              style={styles.pairButton}
            />
          </View>

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

          <Eyebrow label={t('settings.dangerZone')} color={colors.danger} />
          <Text style={styles.note}>{t('settings.dangerNote')}</Text>
          <ShardButton label={t('settings.wipeAll')} onPress={onWipe} loading={wiping} disabled={wiping} color={colors.danger} />

          <View style={styles.footer}>
            <Star size={14} color={colors.textFaint} filled={false} rotation={12} strokeWidth={70} />
          </View>
        </KeyboardAwareScrollView>
      ) : null}

      <FormScreenHeader title={t('settings.title')} />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    chips: { marginBottom: 26 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 26 },
    modelChips: { marginTop: -6 },
    rowLabel: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
    testButton: { alignSelf: 'flex-start', marginTop: 4 },
    statusText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 14 },
    buttonPairRow: { flexDirection: 'row', gap: 14 },
    pairButton: { flex: 1 },
    linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    linkLabel: { marginBottom: 0 },
    chevron: { color: colors.textFaint, fontSize: 20 },
    footer: { alignItems: 'center', marginTop: 36 },
  })
