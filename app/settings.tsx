import * as Haptics from 'expo-haptics'
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
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ServerSettings } from '@/db/settings'
import { exportBackup, importBackup, wipeAllData } from '@/lib/backup'
import { confirm, showMessage } from '@/lib/dialogs'
import { fonts, useColors, useTheme, type ThemePreference } from '@/theme'

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Системная' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
]

type Status = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' | 'error'; text: string }

export default function SettingsScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const { preference, setPreference } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

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
      setStatus({ kind: 'ok', text: found.length ? `Подключено. Моделей на сервере: ${found.length}` : 'Подключено' })
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
      showMessage('Не удалось экспортировать', err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  const onImport = async () => {
    setImporting(true)
    try {
      const result = await importBackup(db)
      if (result) showMessage('Готово', `Добавлено персонажей: ${result.characters}`)
    } catch (err) {
      showMessage('Не удалось импортировать', err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  const onWipe = () => {
    confirm({
      title: 'Стереть все данные?',
      message: 'Все персонажи, переписки, аватары и адрес сервера будут удалены без возможности восстановления.',
      confirmLabel: 'Стереть всё',
      destructive: true,
      onConfirm: async () => {
        setWiping(true)
        try {
          await wipeAllData(db)
          setCfg(DEFAULT_SETTINGS)
          router.dismissTo('/')
        } catch (err) {
          showMessage('Не удалось стереть данные', err instanceof Error ? err.message : String(err))
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
          <Text style={styles.section}>Оформление</Text>
          <View style={styles.segment}>
            {THEME_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setPreference(opt.value)}
                style={[styles.segmentItem, preference === opt.value && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentText, preference === opt.value && styles.segmentTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.section, { marginTop: 36 }]}>Сервер</Text>
          <Field
            label="Base URL"
            hint="Адрес в Tailscale или локальной сети. Путь /v1 добавлять не нужно."
            value={cfg.baseUrl}
            onChangeText={(baseUrl) => update({ baseUrl })}
            placeholder="http://100.x.y.z:1234"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="API key"
            hint="LM Studio, llama.cpp и Ollama обычно ключ не проверяют."
            value={cfg.apiKey}
            onChangeText={(apiKey) => update({ apiKey })}
            placeholder="not-needed"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="Модель"
            value={cfg.model}
            onChangeText={(model) => update({ model })}
            placeholder="local-model"
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
                    <Text style={[styles.chipText, active && { color: colors.text }]} numberOfLines={1}>
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
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
          >
            {status.kind === 'testing' ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.buttonText}>Проверить связь</Text>
            )}
          </Pressable>

          {status.kind === 'ok' || status.kind === 'error' ? (
            <View style={styles.status}>
              <View style={[styles.dot, { backgroundColor: status.kind === 'ok' ? colors.success : colors.danger }]} />
              <Text style={styles.statusText}>{status.text}</Text>
            </View>
          ) : null}

          <Text style={[styles.section, { marginTop: 36 }]}>Резервная копия</Text>
          <Text style={styles.note}>
            Файл JSON содержит персонажей, переписки и аватары. Ключ API в него не попадает. Его можно сохранить в
            Файлы или iCloud Drive.
          </Text>
          <Pressable
            onPress={onExport}
            disabled={exporting}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
          >
            {exporting ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.buttonText}>Экспорт в JSON</Text>}
          </Pressable>
          <Pressable
            onPress={onImport}
            disabled={importing}
            style={({ pressed }) => [styles.button, { marginTop: 10 }, pressed && { opacity: 0.7 }]}
          >
            {importing ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.buttonText}>Импорт из JSON</Text>}
          </Pressable>

          <Text style={[styles.section, { marginTop: 36 }]}>О приложении</Text>
          <Pressable
            onPress={() => router.push('/about')}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.buttonText}>О Reverie</Text>
          </Pressable>

          <Text style={[styles.section, { color: colors.danger, marginTop: 36 }]}>Опасная зона</Text>
          <Text style={styles.note}>
            Стирает всех персонажей, переписки, аватары и адрес сервера. Отменить нельзя.
          </Text>
          <Pressable
            onPress={onWipe}
            disabled={wiping}
            style={({ pressed }) => [styles.button, styles.dangerButton, pressed && { opacity: 0.7 }]}
          >
            {wiping ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.danger }]}>Стереть все данные</Text>
            )}
          </Pressable>
        </KeyboardAwareScrollView>
      ) : null}

      <GlassHeader left={<IconButton name="chevron-back" size={26} onPress={() => router.back()} />}>
        <Text style={styles.title}>Настройки</Text>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    title: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, fontWeight: '600' },
    section: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, marginBottom: 14 },
    segment: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 10, padding: 3, marginBottom: 20 },
    segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    segmentItemActive: { backgroundColor: colors.accentSoft },
    segmentText: { color: colors.textMuted, fontSize: 13 },
    segmentTextActive: { color: colors.accent, fontWeight: '600' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20, marginTop: -6 },
    chip: {
      maxWidth: '100%',
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    chipText: { color: colors.textMuted, fontSize: 13 },
    button: {
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    buttonText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
    dangerButton: { borderColor: 'rgba(240, 97, 109, 0.35)' },
    status: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingHorizontal: 4 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
    statusText: { flex: 1, color: colors.textMuted, fontSize: 14, lineHeight: 20 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  })
