import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { Avatar } from '@/components/Avatar'
import { EdgeFade } from '@/components/BarChrome'
import { useHeaderHeight, useScreenPadding } from '@/components/GlassHeader'
import { Divider } from '@/components/motifs/Divider'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import { FieldRow } from '@/components/motifs/FieldRow'
import { ShardButton } from '@/components/motifs/ShardButton'
import { ShardChip } from '@/components/motifs/ShardChip'
import { Star } from '@/components/motifs/Star'
import { ParamSlider } from '@/components/ParamSlider'
import { PromptGenModal, type GeneratedCharacter } from '@/components/PromptGenModal'
import { DEFAULT_SAMPLING, deleteCharacter, getCharacter, saveCharacter, type ThinkingMode } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { pickAvatar, persistAvatar, removeAvatar } from '@/lib/avatars'
import { confirm, showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import { plural } from '@/lib/format'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

export default function CharacterEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const db = useSQLiteContext()
  const router = useRouter()
  const headerHeight = useHeaderHeight()
  const titleMaxWidth = useWindowDimensions().width - 160
  const padding = useScreenPadding('form')
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
      showMessage(t('editor.saveFailedTitle'), errorMessage(err))
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
          contentContainerStyle={padding}
        >
          <View style={styles.avatarBlock}>
            {/* With a photo the tap opens it; without one it picks a photo. */}
            {hasPhoto ? (
              <Avatar name={name} file={avatar} uri={pickedUri} size={96} />
            ) : (
              <Pressable onPress={onPickAvatar} style={({ pressed }) => pressed && { opacity: 0.8 }}>
                <Avatar name={name} file={avatar} uri={pickedUri} size={96} />
              </Pressable>
            )}
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

          <FieldRow
            label={t('editor.nameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('editor.namePlaceholder')}
            autoCapitalize="sentences"
          />

          <Divider />

          <Eyebrow label={t('editor.genParamsSection')} color={colors.accent} />
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

          <Divider />

          <Eyebrow label={t('editor.thinkingSection')} color={colors.accent} />
          <View style={styles.chipsRow}>
            {THINKING_OPTIONS.map((opt) => (
              <ShardChip key={opt.value} label={opt.label} active={thinking === opt.value} onPress={() => setThinking(opt.value)} />
            ))}
          </View>
          <Text style={styles.note}>{t('editor.thinkingHint')}</Text>

          <Divider />

          <Eyebrow label={t('editor.replyLengthSection')} color={colors.accent} />
          <ParamSlider
            label={t('editor.paragraphLimit')}
            value={replyLimit ?? 0}
            min={0}
            max={6}
            step={1}
            formatValue={(v) => (v === 0 ? t('editor.unlimited') : `${v} ${plural(v, locale, ['абзац', 'абзаца', 'абзацев'], ['paragraph', 'paragraphs'])}`)}
            onChange={(v) => setReplyLimit(v === 0 ? null : v)}
          />
          <Text style={styles.note}>{t('editor.replyLengthHint')}</Text>

          <Divider />

          <Eyebrow label={t('editor.greetingLabel')} color={colors.accent} />
          <FieldRow
            hint={t('editor.greetingHint')}
            value={greeting}
            onChangeText={setGreeting}
            placeholder={t('editor.greetingPlaceholder')}
            multiline
          />

          <Divider />

          <View style={styles.systemPromptHeader}>
            <Eyebrow label={t('editor.systemPromptLabel')} color={colors.accent} />
            {beforeGen ? (
              <Pressable onPress={undoGenerated} hitSlop={8}>
                <Text style={styles.linkMuted}>{t('editor.undoGenerated')}</Text>
              </Pressable>
            ) : null}
          </View>
          <ShardButton
            label={systemPrompt.trim() ? t('editor.improveWithAi') : t('editor.generateWithAi')}
            onPress={() => setShowPromptGen(true)}
            style={styles.aiButton}
          />
          <FieldRow
            hint={t('editor.systemPromptHint')}
            value={systemPrompt}
            onChangeText={(v) => {
              setSystemPrompt(v)
              setBeforeGen(null)
            }}
            placeholder={t('editor.systemPromptPlaceholder')}
            multiline
            minHeight={180}
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
            <>
              <Divider />
              <ShardButton label={t('editor.deleteCharacter')} onPress={confirmDelete} color={colors.danger} />
            </>
          ) : null}
        </KeyboardAwareScrollView>
      ) : null}

      <EdgeFade edge="top" style={{ pointerEvents: 'none', height: headerHeight + 28, position: 'absolute', top: 0, left: 0, right: 0 }} />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTitleAlign: 'left',
          headerTitle: () => (
            <View style={[styles.titleRow, { maxWidth: titleMaxWidth }]}>
              <Star size={22} color={colors.danger} rotation={-14} style={styles.titleStar} />
              <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{isNew ? t('editor.newCharacterTitle') : t('editor.characterTitle')}</Text>
            </View>
          ),
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="checkmark" disabled={!canSave} onPress={onSave} />
      </Stack.Toolbar>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    titleStar: { marginTop: 2 },
    title: { color: colors.text, fontFamily: fonts.prose, fontWeight: '700', fontSize: 28, flexShrink: 1 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
    aiButton: { alignSelf: 'flex-start', marginBottom: 18 },
    avatarBlock: { alignItems: 'center', marginBottom: 28, gap: 12 },
    avatarActions: { flexDirection: 'row', gap: 20 },
    link: { color: colors.accent, fontSize: 15 },
    linkMuted: { color: colors.textMuted, fontSize: 15 },
    systemPromptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  })
