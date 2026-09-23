import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { testConnection } from '@/api/llm'
import { Field } from '@/components/Field'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { IconButton } from '@/components/IconButton'
import { Segmented } from '@/components/Segmented'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ServerSettings } from '@/db/settings'
import { useTranslation, type LocalePreference } from '@/i18n'
import { exportBackup, importBackup, wipeAllData } from '@/lib/backup'
import { confirm, showMessage } from '@/lib/dialogs'
import * as Haptics from '@/lib/haptics'
import { fonts, useColors, useTheme, type ThemePreference } from '@/theme'

type Status = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' | 'error'; text: string }

export default function SettingsScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const { preference, setPreference } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
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
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  const onExport = async () => {
    setExporting(true)
    try {
      await exportBackup(db)
    } catch (err) {
      showMessage(t('settings.exportFailedTitle'), err instanceof Error ? err.message : String(err))
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
      showMessage(t('settings.importFailedTitle'), err instanceof Error ? err.message : String(err))
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
          showMessage(t('settings.wipeFailedTitle'), err instanceof Error ? err.message : String(err))
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
          contentContainerStyle={{ paddingTop: headerHeight + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
        >
          <Text style={styles.section}>{t('settings.appearance')}</Text>
          <View style={styles.card}>
            <View style={styles.cardPad}>
              <Text style={styles.label}>{t('settings.appearance')}</Text>
              <Segmented options={THEME_OPTIONS} value={preference} onChange={setPreference} />
              <Text style={[styles.label, { marginTop: 18 }]}>{t('settings.language')}</Text>
              <Segmented options={LANGUAGE_OPTIONS} value={localePreference} onChange={setLocalePreference} />
            </View>
          </View>

          <Text style={[styles.section, { marginTop: 32 }]}>{t('settings.server')}</Text>
          <View style={styles.card}>
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

              <Pressable
                onPress={onTest}
                disabled={status.kind === 'testing'}
                style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}
              >
                {status.kind === 'testing' ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <Ionicons name="pulse-outline" size={18} color={colors.accent} />
                    <Text style={styles.actionButtonText}>{t('settings.testConnection')}</Text>
                  </>
                )}
              </Pressable>

              {status.kind === 'ok' || status.kind === 'error' ? (
                <View style={styles.status}>
                  <View style={[styles.dot, { backgroundColor: status.kind === 'ok' ? colors.success : colors.danger }]} />
                  <Text style={styles.statusText}>{status.text}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={[styles.section, { marginTop: 32 }]}>{t('settings.backupTitle')}</Text>
          <Text style={styles.note}>{t('settings.backupNote')}</Text>
          <View style={styles.card}>
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
              last
            />
          </View>

          <Text style={[styles.section, { marginTop: 32 }]}>{t('settings.aboutTitle')}</Text>
          <View style={styles.card}>
            <Row icon="information-circle-outline" title={t('settings.aboutReverie')} onPress={() => router.push('/about')} chevron last />
          </View>

          <Text style={[styles.section, { color: colors.danger, marginTop: 32 }]}>{t('settings.dangerZone')}</Text>
          <Text style={styles.note}>{t('settings.dangerNote')}</Text>
          <View style={[styles.card, styles.dangerCard]}>
            <Row
              icon="trash-outline"
              title={t('settings.wipeAll')}
              onPress={onWipe}
              loading={wiping}
              disabled={wiping}
              tint={colors.danger}
              last
            />
          </View>
        </KeyboardAwareScrollView>
      ) : null}

      <GlassHeader left={<IconButton name="chevron-back" size={26} onPress={() => router.back()} />}>
        <Text style={styles.title}>{t('settings.title')}</Text>
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
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  chevron?: boolean
  tint?: string
  last?: boolean
}) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const color = tint ?? colors.accent
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.6 }]}
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

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    title: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, fontWeight: '600' },
    section: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginLeft: 4 },
    card: {
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    dangerCard: { borderColor: 'rgba(240, 97, 109, 0.35)' },
    cardPad: { padding: 16 },
    label: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
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
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      borderRadius: 12,
      backgroundColor: colors.accentSoft,
    },
    actionButtonText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
    status: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
    statusText: { flex: 1, color: colors.textMuted, fontSize: 14, lineHeight: 20 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 10, marginLeft: 4 },
  })
