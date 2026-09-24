import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { testConnection } from '@/api/llm'
import { Button } from '@/components/Button'
import { Field, FieldLabel } from '@/components/Field'
import { BackButton, GlassHeader, HeaderTitle, useScreenPadding } from '@/components/GlassHeader'
import { Group } from '@/components/Group'
import { Segmented } from '@/components/Segmented'
import { isContinueEnabled, setContinueEnabled } from '@/db/continue'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ServerSettings } from '@/db/settings'
import { useTranslation, type LocalePreference } from '@/i18n'
import { exportBackup, importBackup, wipeAllData } from '@/lib/backup'
import { confirm, showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import * as Haptics from '@/lib/haptics'
import { useColors, useStyles, useTheme, type Colors, type ThemePreference } from '@/theme'

type Status = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' | 'error'; text: string }

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
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [models, setModels] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [continueButton, setContinueButton] = useState(true)

  useEffect(() => {
    isContinueEnabled(db).then(setContinueButton)
  }, [db])

  const toggleContinueButton = (enabled: boolean) => {
    setContinueButton(enabled)
    setContinueEnabled(db, enabled)
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

  const onTest = async () => {
    setStatus({ kind: 'testing' })
    try {
      const found = await testConnection(cfg)
      setModels(found)
      setStatus({
        kind: 'ok',
        text: found.length ? t('settings.connectedWithModels', { count: found.length }) : t('settings.connected'),
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      setModels([])
      setStatus({ kind: 'error', text: errorMessage(err) })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  const onExport = async () => {
    setExporting(true)
    try {
      await exportBackup(db)
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
          <Text style={styles.section}>{t('settings.appearance')}</Text>
          <Group>
            <View style={styles.cardPad}>
              <FieldLabel>{t('settings.appearance')}</FieldLabel>
              <Segmented options={THEME_OPTIONS} value={preference} onChange={setPreference} />
              <FieldLabel style={{ marginTop: 18 }}>{t('settings.language')}</FieldLabel>
              <Segmented options={LANGUAGE_OPTIONS} value={localePreference} onChange={setLocalePreference} />
            </View>
          </Group>

          <Text style={[styles.section, { marginTop: 32 }]}>{t('settings.homeScreen')}</Text>
          <Text style={styles.note}>{t('settings.continueButtonNote')}</Text>
          <Group>
            <View style={styles.switchRow}>
              <Ionicons name="play-circle-outline" size={19} color={colors.accent} style={{ width: 24 }} />
              <Text style={styles.switchLabel}>{t('settings.continueButton')}</Text>
              <Switch value={continueButton} onValueChange={toggleContinueButton} trackColor={{ true: colors.accent }} />
            </View>
          </Group>

          <Text style={[styles.section, { marginTop: 32 }]}>{t('settings.server')}</Text>
          <Group>
            <View style={styles.cardPad}>
              <Field
                label={t('settings.baseUrlLabel')}
                hint={t('settings.baseUrlHint')}
                value={cfg.baseUrl}
                onChangeText={(baseUrl) => update({ baseUrl })}
                placeholder={t('settings.baseUrlPlaceholder')}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Field
                label={t('settings.apiKeyLabel')}
                hint={t('settings.apiKeyHint')}
                value={cfg.apiKey}
                onChangeText={(apiKey) => update({ apiKey })}
                placeholder={t('settings.apiKeyPlaceholder')}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Field
                label={t('settings.modelLabel')}
                value={cfg.model}
                onChangeText={(model) => update({ model })}
                placeholder={t('settings.modelPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {models.length > 0 ? (
                <View style={styles.chips}>
                  {models.map((id) => {
                    const active = id === cfg.model
                    return (
                      <Pressable
                        key={id}
                        onPress={() => update({ model: id })}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && { color: colors.accent }]} numberOfLines={1}>
                          {id}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}

              <Button
                variant="soft"
                label={t('settings.testConnection')}
                onPress={onTest}
                loading={status.kind === 'testing'}
              />

              {status.kind === 'ok' || status.kind === 'error' ? (
                <Text style={styles.statusText}>{status.text}</Text>
              ) : null}
            </View>
          </Group>

          <Text style={[styles.section, { marginTop: 32 }]}>{t('settings.backupTitle')}</Text>
          <Text style={styles.note}>{t('settings.backupNote')}</Text>
          <Group>
            <Row
              icon="share-outline"
              title={t('settings.exportJson')}
              onPress={onExport}
              loading={exporting}
              disabled={exporting}
            />
            <Row
              icon="download-outline"
              title={t('settings.importJson')}
              onPress={onImport}
              loading={importing}
              disabled={importing}
            />
          </Group>

          <Text style={[styles.section, { marginTop: 32 }]}>{t('settings.aboutTitle')}</Text>
          <Group>
            <Row icon="information-circle-outline" title={t('settings.aboutReverie')} onPress={() => router.push('/about')} chevron />
          </Group>

          <Text style={[styles.section, { color: colors.danger, marginTop: 32 }]}>{t('settings.dangerZone')}</Text>
          <Text style={styles.note}>{t('settings.dangerNote')}</Text>
          <Group style={styles.dangerCard}>
            <Row
              icon="trash-outline"
              title={t('settings.wipeAll')}
              onPress={onWipe}
              loading={wiping}
              disabled={wiping}
              tint={colors.danger}
            />
          </Group>
        </KeyboardAwareScrollView>
      ) : null}

      <GlassHeader left={<BackButton />}>
        <HeaderTitle>{t('settings.title')}</HeaderTitle>
      </GlassHeader>
    </View>
  )
}

function Row({
  icon,
  title,
  onPress,
  loading,
  disabled,
  chevron,
  tint,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  chevron?: boolean
  tint?: string
}) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const color = tint ?? colors.accent
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={19} color={color} style={{ width: 24 }} />
      <Text style={[styles.rowLabel, { color }]}>{title}</Text>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : chevron ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      ) : null}
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    section: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginLeft: 4 },
    dangerCard: { borderColor: colors.dangerBorder },
    cardPad: { padding: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -6, marginBottom: 16 },
    chip: {
      maxWidth: '100%',
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    chipText: { color: colors.textMuted, fontSize: 13 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
    rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
    switchLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
    statusText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 14 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 10, marginLeft: 4 },
  })
