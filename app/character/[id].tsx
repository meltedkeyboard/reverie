import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '@/components/Avatar'
import { Field } from '@/components/Field'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { IconButton } from '@/components/IconButton'
import { ParamSlider } from '@/components/ParamSlider'
import { DEFAULT_SAMPLING, deleteCharacter, getCharacter, saveCharacter, type ThinkingMode } from '@/db/characters'
import { pickAvatar, persistAvatar, removeAvatar } from '@/lib/avatars'
import { confirm, showMessage } from '@/lib/dialogs'
import { fonts, useColors } from '@/theme'

const THINKING_OPTIONS: { value: ThinkingMode; label: string }[] = [
  { value: 'auto', label: 'Как на сервере' },
  { value: 'on', label: 'Включено' },
  { value: 'off', label: 'Выключено' },
]

export default function CharacterEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [ready, setReady] = useState(isNew)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [greeting, setGreeting] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [pickedUri, setPickedUri] = useState<string | null>(null)
  const [temperature, setTemperature] = useState<number>(DEFAULT_SAMPLING.temperature)
  const [maxTokens, setMaxTokens] = useState<number>(DEFAULT_SAMPLING.maxTokens)
  const [topP, setTopP] = useState<number>(DEFAULT_SAMPLING.topP)
  const [replyLimit, setReplyLimit] = useState<number | null>(null)
  const [thinking, setThinking] = useState<ThinkingMode>('auto')
  const storedAvatar = useRef<string | null>(null)

  useEffect(() => {
    if (isNew) return
    getCharacter(db, Number(id)).then((found) => {
      if (!found) return router.back()
      setName(found.name)
      setSystemPrompt(found.systemPrompt)
      setGreeting(found.greeting)
      setAvatar(found.avatar)
      setTemperature(found.temperature)
      setMaxTokens(found.maxTokens)
      setTopP(found.topP)
      setReplyLimit(found.replyLimit)
      setThinking(found.thinking)
      storedAvatar.current = found.avatar
      setReady(true)
    })
  }, [db, id, isNew, router])

  const canSave = ready && !saving && name.trim().length > 0

  const onPickAvatar = async () => {
    const uri = await pickAvatar()
    if (uri) setPickedUri(uri)
  }

  const onClearAvatar = () => {
    setPickedUri(null)
    setAvatar(null)
  }

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const nextAvatar = pickedUri ? await persistAvatar(pickedUri) : avatar
      await saveCharacter(db, isNew ? null : Number(id), {
        name,
        avatar: nextAvatar,
        systemPrompt,
        greeting,
        temperature,
        maxTokens,
        topP,
        replyLimit,
        thinking,
      })
      if (storedAvatar.current && storedAvatar.current !== nextAvatar) removeAvatar(storedAvatar.current)
      router.back()
    } catch (err) {
      setSaving(false)
      showMessage('Не удалось сохранить', err instanceof Error ? err.message : String(err))
    }
  }

  const confirmDelete = () => {
    confirm({
      title: 'Удалить персонажа?',
      message: 'Персонаж и все чаты с ним будут удалены без возможности восстановления.',
      confirmLabel: 'Удалить',
      destructive: true,
      onConfirm: async () => {
        await deleteCharacter(db, Number(id))
        if (storedAvatar.current) removeAvatar(storedAvatar.current)
        router.dismissTo('/')
      },
    })
  }

  const hasPhoto = Boolean(pickedUri || avatar)

  return (
    <View style={styles.screen}>
      {ready ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingTop: headerHeight + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
        >
          <View style={styles.avatarBlock}>
            <Pressable onPress={onPickAvatar} style={({ pressed }) => pressed && { opacity: 0.8 }}>
              <Avatar name={name} file={avatar} uri={pickedUri} size={96} />
            </Pressable>
            <View style={styles.avatarActions}>
              <Pressable onPress={onPickAvatar} hitSlop={8}>
                <Text style={styles.link}>{hasPhoto ? 'Сменить фото' : 'Выбрать фото'}</Text>
              </Pressable>
              {hasPhoto ? (
                <Pressable onPress={onClearAvatar} hitSlop={8}>
                  <Text style={styles.linkMuted}>Убрать</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Field label="Имя" value={name} onChangeText={setName} placeholder="Например, Элиара" autoCapitalize="sentences" />

          <Text style={styles.section}>Параметры генерации</Text>
          <ParamSlider
            label="Temperature"
            value={temperature}
            min={0}
            max={2}
            step={0.05}
            digits={2}
            onChange={(v) => setTemperature(Math.round(v * 100) / 100)}
          />
          <ParamSlider label="Max tokens" value={maxTokens} min={100} max={4096} step={1} onChange={setMaxTokens} />
          <ParamSlider
            label="Top-P"
            value={topP}
            min={0.1}
            max={1}
            step={0.01}
            digits={2}
            onChange={(v) => setTopP(Math.round(v * 100) / 100)}
          />

          <Text style={styles.section}>Режим размышления</Text>
          <View style={styles.segment}>
            {THINKING_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setThinking(opt.value)}
                style={[styles.segmentItem, thinking === opt.value && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentText, thinking === opt.value && styles.segmentTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            «Как на сервере» ничего не добавляет к запросу — модель думает или нет так, как настроено в LM Studio. «Включено» и
            «Выключено» переопределяют это для конкретного персонажа (поддерживают модели вроде Qwen3).
          </Text>

          <Text style={styles.section}>Длина ответа</Text>
          <ParamSlider
            label="Лимит абзацев"
            value={replyLimit ?? 0}
            min={0}
            max={6}
            step={1}
            formatValue={(v) => (v === 0 ? 'Без ограничений' : `${v} ${v === 1 ? 'абзац' : v < 5 ? 'абзаца' : 'абзацев'}`)}
            onChange={(v) => setReplyLimit(v === 0 ? null : v)}
          />
          <Text style={styles.hint}>
            Модель получит инструкцию уложиться в это число абзацев. Без ограничений системный промпт остаётся
            нетронутым.
          </Text>

          <Field
            label="Приветствие"
            hint="Первое сообщение, которое персонаж отправляет в новом диалоге."
            value={greeting}
            onChangeText={setGreeting}
            placeholder={'*поднимает взгляд от костра* Проходи, путник.'}
            multiline
          />

          <Field
            label="Системный промпт"
            hint="Характер, роль, манера речи и сеттинг."
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            placeholder="Ты Элиара, странствующая травница..."
            multiline
            style={{ minHeight: 180 }}
          />

          {!isNew ? (
            <Pressable onPress={confirmDelete} style={({ pressed }) => [styles.delete, pressed && { opacity: 0.6 }]}>
              <Text style={styles.deleteText}>Удалить персонажа</Text>
            </Pressable>
          ) : null}
        </KeyboardAwareScrollView>
      ) : null}

      <GlassHeader
        left={<IconButton name={isNew ? 'close' : 'chevron-back'} size={isNew ? 24 : 26} onPress={() => router.back()} />}
        right={
          <Pressable onPress={onSave} disabled={!canSave} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={[styles.save, !canSave && { color: colors.textFaint }]}>Сохранить</Text>
          </Pressable>
        }
      >
        <Text style={styles.title} numberOfLines={1}>
          {isNew ? 'Новый персонаж' : 'Персонаж'}
        </Text>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, fontWeight: '600' },
  save: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  avatarBlock: { alignItems: 'center', marginBottom: 28, gap: 12 },
  avatarActions: { flexDirection: 'row', gap: 20 },
  link: { color: colors.accent, fontSize: 15 },
  linkMuted: { color: colors.textMuted, fontSize: 15 },
  section: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, marginTop: 8, marginBottom: 12 },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: -4, marginBottom: 4, marginHorizontal: 4 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentItemActive: { backgroundColor: colors.accentSoft },
  segmentText: { color: colors.textMuted, fontSize: 13 },
  segmentTextActive: { color: colors.accent, fontWeight: '600' },
  delete: { alignItems: 'center', marginTop: 32, paddingVertical: 14 },
  deleteText: { color: colors.danger, fontSize: 16 },
})
