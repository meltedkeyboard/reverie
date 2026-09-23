import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '@/components/Avatar'
import { Field } from '@/components/Field'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { IconButton } from '@/components/IconButton'
import { ParamSlider } from '@/components/ParamSlider'
import { PromptGenModal, type GeneratedCharacter } from '@/components/PromptGenModal'
import { Segmented } from '@/components/Segmented'
import { DEFAULT_SAMPLING, deleteCharacter, getCharacter, saveCharacter, type ThinkingMode } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { pickAvatar, persistAvatar, removeAvatar } from '@/lib/avatars'
import { confirm, showMessage } from '@/lib/dialogs'
import { plural } from '@/lib/format'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

export default function CharacterEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()

  const THINKING_OPTIONS: { value: ThinkingMode; label: string }[] = [
    { value: 'auto', label: t('editor.thinkingAuto') },
    { value: 'on', label: t('editor.thinkingOn') },
    { value: 'off', label: t('editor.thinkingOff') },
  ]

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
  const [showPromptGen, setShowPromptGen] = useState(false)
  // What the prompt and greeting were before the last AI result replaced them, until
  // the user edits the prompt by hand.
  const [beforeGen, setBeforeGen] = useState<{ prompt: string; greeting: string } | null>(null)
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
      showMessage(t('editor.saveFailedTitle'), err instanceof Error ? err.message : String(err))
    }
  }

  const confirmDelete = () => {
    confirm({
      title: t('editor.deleteConfirmTitle'),
      message: t('editor.deleteConfirmMessage'),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        await deleteCharacter(db, Number(id))
        if (storedAvatar.current) removeAvatar(storedAvatar.current)
        router.dismissTo('/')
      },
    })
  }

  const applyGenerated = (result: GeneratedCharacter) => {
    setBeforeGen({ prompt: systemPrompt, greeting })
    setSystemPrompt(result.prompt)
    if (result.greeting !== null) setGreeting(result.greeting)
  }

  const undoGenerated = () => {
    if (!beforeGen) return
    setSystemPrompt(beforeGen.prompt)
    setGreeting(beforeGen.greeting)
    setBeforeGen(null)
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
                <Text style={styles.link}>{hasPhoto ? t('editor.changePhoto') : t('editor.choosePhoto')}</Text>
              </Pressable>
              {hasPhoto ? (
                <Pressable onPress={onClearAvatar} hitSlop={8}>
                  <Text style={styles.linkMuted}>{t('editor.removePhoto')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Field
            label={t('editor.nameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('editor.namePlaceholder')}
            autoCapitalize="sentences"
          />

          <Text style={styles.section}>{t('editor.genParamsSection')}</Text>
          <ParamSlider
            label={t('editor.temperature')}
            value={temperature}
            min={0}
            max={2}
            step={0.05}
            digits={2}
            onChange={(v) => setTemperature(Math.round(v * 100) / 100)}
          />
          <ParamSlider label={t('editor.maxTokens')} value={maxTokens} min={100} max={4096} step={1} onChange={setMaxTokens} />
          <ParamSlider
            label={t('editor.topP')}
            value={topP}
            min={0.1}
            max={1}
            step={0.01}
            digits={2}
            onChange={(v) => setTopP(Math.round(v * 100) / 100)}
          />

          <Text style={styles.section}>{t('editor.thinkingSection')}</Text>
          <Segmented options={THINKING_OPTIONS} value={thinking} onChange={setThinking} style={{ marginBottom: 8 }} />
          <Text style={styles.hint}>{t('editor.thinkingHint')}</Text>

          <Text style={styles.section}>{t('editor.replyLengthSection')}</Text>
          <ParamSlider
            label={t('editor.paragraphLimit')}
            value={replyLimit ?? 0}
            min={0}
            max={6}
            step={1}
            formatValue={(v) => (v === 0 ? t('editor.unlimited') : `${v} ${plural(v, locale, ['абзац', 'абзаца', 'абзацев'], ['paragraph', 'paragraphs'])}`)}
            onChange={(v) => setReplyLimit(v === 0 ? null : v)}
          />
          <Text style={styles.hint}>{t('editor.replyLengthHint')}</Text>

          <Field
            label={t('editor.greetingLabel')}
            hint={t('editor.greetingHint')}
            value={greeting}
            onChangeText={setGreeting}
            placeholder={t('editor.greetingPlaceholder')}
            multiline
          />

          <View style={styles.systemPromptHeader}>
            <Text style={styles.systemPromptLabel}>{t('editor.systemPromptLabel')}</Text>
            {beforeGen ? (
              <Pressable onPress={undoGenerated} hitSlop={8}>
                <Text style={styles.linkMuted}>{t('editor.undoGenerated')}</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setShowPromptGen(true)}
            style={({ pressed }) => [styles.aiButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="sparkles" size={16} color={colors.accent} />
            <Text style={styles.aiButtonText}>
              {systemPrompt.trim() ? t('editor.improveWithAi') : t('editor.generateWithAi')}
            </Text>
          </Pressable>
          <Field
            hint={t('editor.systemPromptHint')}
            value={systemPrompt}
            onChangeText={(v) => {
              setSystemPrompt(v)
              setBeforeGen(null)
            }}
            placeholder={t('editor.systemPromptPlaceholder')}
            multiline
            style={{ minHeight: 180 }}
          />

          <PromptGenModal
            visible={showPromptGen}
            name={name}
            currentPrompt={systemPrompt}
            currentGreeting={greeting}
            onClose={() => setShowPromptGen(false)}
            onApply={applyGenerated}
          />

          {!isNew ? (
            <Pressable onPress={confirmDelete} style={({ pressed }) => [styles.delete, pressed && { opacity: 0.6 }]}>
              <Text style={styles.deleteText}>{t('editor.deleteCharacter')}</Text>
            </Pressable>
          ) : null}
        </KeyboardAwareScrollView>
      ) : null}

      <GlassHeader
        left={<IconButton name={isNew ? 'close' : 'chevron-back'} size={isNew ? 24 : 26} onPress={() => router.back()} />}
        right={
          <Pressable onPress={onSave} disabled={!canSave} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={[styles.save, !canSave && { color: colors.textFaint }]}>{t('common.save')}</Text>
          </Pressable>
        }
      >
        <Text style={styles.title} numberOfLines={1}>
          {isNew ? t('editor.newCharacterTitle') : t('editor.characterTitle')}
        </Text>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    title: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, fontWeight: '600' },
    save: { color: colors.accent, fontSize: 16, fontWeight: '600' },
    avatarBlock: { alignItems: 'center', marginBottom: 28, gap: 12 },
    avatarActions: { flexDirection: 'row', gap: 20 },
    link: { color: colors.accent, fontSize: 15 },
    linkMuted: { color: colors.textMuted, fontSize: 15 },
    section: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, marginTop: 8, marginBottom: 12 },
    systemPromptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      marginLeft: 4,
      marginRight: 4,
    },
    systemPromptLabel: { color: colors.textMuted, fontSize: 13 },
    aiButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      marginBottom: 10,
      borderRadius: 14,
      backgroundColor: colors.accentSoft,
    },
    aiButtonText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
    hint: { color: colors.textFaint, fontSize: 12, marginTop: -4, marginBottom: 4, marginHorizontal: 4 },
    delete: { alignItems: 'center', marginTop: 32, paddingVertical: 14 },
    deleteText: { color: colors.danger, fontSize: 16 },
  })
