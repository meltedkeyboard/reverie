import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated, { useAnimatedReaction, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { Avatar } from '@/components/Avatar'
import { CharacterProfile } from '@/components/CharacterProfile'
import { ChatBackground } from '@/components/ChatBackground'
import { ImageSourceMenu } from '@/components/ImageSourceMenu'
import { ChipGroup } from '@/components/ChipGroup'
import { ExpandingAvatar, useSpreadPush } from '@/components/ExpandingAvatar'
import { BarButton, DrawnFormScreenHeader } from '@/components/FormScreenHeader'
import { useScreenPadding } from '@/components/GlassHeader'
import { Divider } from '@/components/motifs/Divider'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import { FieldRow } from '@/components/motifs/FieldRow'
import { PillButton } from '@/components/PillButton'
import { ParamSlider } from '@/components/ParamSlider'
import { PromptGenModal, type GeneratedCharacter } from '@/components/PromptGenModal'
import {
  DEFAULT_SAMPLING,
  deleteCharacter,
  getCharacter,
  saveCharacter,
  type BackgroundEffect,
  type ThinkingMode,
} from '@/db/characters'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import { setAvatarCropDraft } from '@/lib/avatarCrop'
import {
  avatarUri,
  persistAvatar,
  acceptMoving,
  pickAvatarFile,
  pickAvatarLibrary,
  pickAvatarPhoto,
  pickBackground,
  removeAvatar,
  removeCharacterImages,
} from '@/lib/avatars'
import { setBackgroundDraft } from '@/lib/backgroundDraft'
import type { ImageSource } from '@/lib/images'
import { confirmDeletion } from '@/lib/confirmDelete'
import { showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import { plural } from '@/lib/format'
import { useColors, useStyles, type Colors } from '@/theme'

export default function CharacterEditorScreen() {
  const { id, profile } = useLocalSearchParams<{ id: string; profile?: string }>()
  const isNew = id === 'new'
  // Opened as the character's profile, it is only looked at until the pencil turns it
  // into the editor, and saving turns it back.
  const asProfile = profile === '1' && !isNew
  const [editing, setEditing] = useState(!asProfile)
  const db = useDatabase()
  const router = useRouter()
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
  const [background, setBackground] = useState<string | null>(null)
  const [bgPickedUri, setBgPickedUri] = useState<string | null>(null)
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>('blur')
  const [bgIntensity, setBgIntensity] = useState(0.5)
  const [bgBubbleTransparency, setBgBubbleTransparency] = useState(0.3)
  const [showPromptGen, setShowPromptGen] = useState(false)
  // What the prompt and greeting were before the last AI result replaced them, until
  // the user edits the prompt by hand.
  const [beforeGen, setBeforeGen] = useState<{ prompt: string; greeting: string } | null>(null)
  const storedAvatar = useRef<string | null>(null)
  const storedBackground = useRef<string | null>(null)

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
      setBackground(found.background)
      setBgEffect(found.backgroundEffect)
      setBgIntensity(found.backgroundIntensity)
      setBgBubbleTransparency(found.backgroundBubbleTransparency)
      storedAvatar.current = found.avatar
      storedBackground.current = found.background
      setReady(true)
    })
  }, [db, id, isNew, router])

  const canSave = ready && !saving && name.trim().length > 0

  const onPickAvatar = async (source: ImageSource) => {
    try {
      if (source === 'camera') {
        const photo = await pickAvatarPhoto()
        if (photo) setPickedUri(photo)
        return
      }
      const file = source === 'files' ? await pickAvatarFile() : await pickAvatarLibrary()
      if (!file) return
      // A GIF or a video keeps its motion, so it skips the crop and is shown by its middle.
      if (acceptMoving(file)) return setPickedUri(file)
      setAvatarCropDraft({ uri: file, onDone: setPickedUri })
      router.push('/avatar-crop')
    } catch (err) {
      showMessage(t('editor.avatarFailedTitle'), errorMessage(err))
    }
  }

  const onClearAvatar = () => {
    setPickedUri(null)
    setAvatar(null)
  }

  // The picture now behind the chat: a fresh pick, else the one already stored.
  const backgroundUri = bgPickedUri ?? (background ? avatarUri(background, 'backgrounds') : null)

  // The effect is tried out on its own screen; what it returns is kept until Save.
  const openBackground = (uri: string, fresh: boolean) => {
    setBackgroundDraft({
      uri,
      characterName: name.trim(),
      effect: bgEffect,
      intensity: bgIntensity,
      bubbleTransparency: bgBubbleTransparency,
      onDone: (result) => {
        if (result.uri) setBgPickedUri(result.uri)
        else if (fresh) setBgPickedUri(uri)
        setBgEffect(result.effect)
        setBgIntensity(result.intensity)
        setBgBubbleTransparency(result.bubbleTransparency)
      },
    })
    router.push('/background')
  }

  const onPickBackground = async (source: ImageSource) => {
    try {
      const uri = await pickBackground(source)
      if (uri) openBackground(uri, true)
    } catch (err) {
      showMessage(t('background.failedTitle'), errorMessage(err))
    }
  }

  const onClearBackground = () => {
    setBgPickedUri(null)
    setBackground(null)
  }

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const nextAvatar = pickedUri ? await persistAvatar(pickedUri) : avatar
      const nextBackground = bgPickedUri ? await persistAvatar(bgPickedUri, 'backgrounds') : background
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
        background: nextBackground,
        backgroundEffect: bgEffect,
        backgroundIntensity: bgIntensity,
        backgroundBubbleTransparency: bgBubbleTransparency,
      })
      if (storedAvatar.current && storedAvatar.current !== nextAvatar) removeAvatar(storedAvatar.current)
      if (storedBackground.current && storedBackground.current !== nextBackground) removeAvatar(storedBackground.current, 'backgrounds')
      if (!asProfile) return router.back()
      // Back to the profile, now showing what was saved.
      storedAvatar.current = nextAvatar
      storedBackground.current = nextBackground
      setAvatar(nextAvatar)
      setPickedUri(null)
      setBackground(nextBackground)
      setBgPickedUri(null)
      setSaving(false)
      setEditing(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      setSaving(false)
      showMessage(t('editor.saveFailedTitle'), errorMessage(err))
    }
  }

  const confirmDelete = () => {
    confirmDeletion({
      title: t('editor.deleteConfirmTitle'),
      message: t('editor.deleteConfirmMessage'),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        await deleteCharacter(db, Number(id))
        removeCharacterImages({ avatar: storedAvatar.current, background: storedBackground.current })
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

  const photoUri = pickedUri ?? (avatar ? avatarUri(avatar) : null)
  const hasPhoto = Boolean(photoUri)
  // The character's own name heads the screen once it has one.
  const title = name.trim() || (isNew ? t('editor.newCharacterTitle') : t('editor.characterTitle'))

  const thinkingLabel = THINKING_OPTIONS.find((option) => option.value === thinking)?.label ?? ''
  const replyLengthLabel = replyLimit
    ? `${replyLimit} ${plural(replyLimit, locale, ['абзац', 'абзаца', 'абзацев'], ['paragraph', 'paragraphs'])}`
    : t('editor.unlimited')

  const scrollY = useSharedValue(0)
  const dragging = useSharedValue(false)
  const photoSpread = useSharedValue(0)
  const pushed = useSpreadPush(photoSpread, padding.paddingTop)
  // Over the open photo the status bar turns light, whatever the theme.
  const [photoOpen, setPhotoOpen] = useState(false)
  useAnimatedReaction(
    () => photoSpread.value > 0.5,
    (open, was) => {
      if (open !== was) scheduleOnRN(setPhotoOpen, open)
    }
  )
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
    onBeginDrag: () => {
      dragging.value = true
    },
    onEndDrag: () => {
      dragging.value = false
    },
  })

  return (
    <View style={styles.screen}>
      {ready ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
          onScroll={onScroll}
        >
          <View style={styles.avatarBlock}>
            {/* With a photo the tap opens it and a pull spreads it out; without one the
                tap picks a photo. */}
            {photoUri ? (
              <ExpandingAvatar
                name={name}
                uri={photoUri}
                scrollY={scrollY}
                dragging={dragging}
                progress={photoSpread}
                top={padding.paddingTop}
                side={padding.paddingHorizontal}
              />
            ) : editing ? (
              <ImageSourceMenu onPick={onPickAvatar}>
                <Avatar name={name} file={avatar} uri={pickedUri} size={96} />
              </ImageSourceMenu>
            ) : (
              <Avatar name={name} file={avatar} size={96} viewable={false} />
            )}
          </View>
          {/* Pushed down by a transform while the photo spreads: animating the height of
              the block above would lay out the whole form again on every frame. */}
          <Animated.View style={pushed}>
            {editing ? (
              <>
                <View style={styles.avatarActions}>
                  <ImageSourceMenu onPick={onPickAvatar}>
                    <Text style={styles.link}>{hasPhoto ? t('editor.changePhoto') : t('editor.choosePhoto')}</Text>
                  </ImageSourceMenu>
                  {hasPhoto ? (
                    <Pressable onPress={onClearAvatar} hitSlop={8}>
                      <Text style={styles.linkMuted}>{t('editor.removePhoto')}</Text>
                    </Pressable>
                  ) : null}
                </View>

                <Eyebrow label={t('background.title')} color={colors.text} />
                <View style={styles.backgroundRow}>
                  <View style={styles.backgroundThumb}>
                    {backgroundUri ? <ChatBackground uri={backgroundUri} effect={bgEffect} intensity={bgIntensity} /> : null}
                  </View>
                  <View style={styles.backgroundActions}>
                    <ImageSourceMenu onPick={onPickBackground}>
                      <Text style={styles.link}>{backgroundUri ? t('background.change') : t('background.choose')}</Text>
                    </ImageSourceMenu>
                    {backgroundUri ? (
                      <>
                        <Pressable onPress={() => openBackground(backgroundUri, false)} hitSlop={8}>
                          <Text style={styles.link}>{t('background.adjust')}</Text>
                        </Pressable>
                        <Pressable onPress={onClearBackground} hitSlop={8}>
                          <Text style={styles.linkMuted}>{t('background.remove')}</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>

                <Divider />

                <FieldRow
                  label={t('editor.nameLabel')}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('editor.namePlaceholder')}
                  autoCapitalize="sentences"
                />

                <Divider />

                <Eyebrow label={t('editor.genParamsSection')} color={colors.text} />
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

                <Eyebrow label={t('editor.thinkingSection')} color={colors.text} />
                <ChipGroup style={styles.chips} options={THINKING_OPTIONS} value={thinking} onChange={setThinking} />
                <Text style={styles.note}>{t('editor.thinkingHint')}</Text>

                <Divider />

                <Eyebrow label={t('editor.replyLengthSection')} color={colors.text} />
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

                <Eyebrow label={t('editor.greetingLabel')} color={colors.text} />
                <FieldRow
                  hint={t('editor.greetingHint')}
                  value={greeting}
                  onChangeText={setGreeting}
                  placeholder={t('editor.greetingPlaceholder')}
                  multiline
                  expandTitle={t('editor.greetingLabel')}
                />

                <Divider />

                <View style={styles.systemPromptHeader}>
                  <Eyebrow label={t('editor.systemPromptLabel')} color={colors.text} />
                  {beforeGen ? (
                    <Pressable onPress={undoGenerated} hitSlop={8}>
                      <Text style={styles.linkMuted}>{t('editor.undoGenerated')}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <PillButton
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
                  expandTitle={t('editor.systemPromptLabel')}
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
                    <PillButton filled label={t('editor.deleteCharacter')} onPress={confirmDelete} color={colors.danger} />
                  </>
                ) : null}
              </>
            ) : (
              <CharacterProfile
                greeting={greeting}
                systemPrompt={systemPrompt}
                params={[
                  { label: t('editor.temperature'), value: temperature.toFixed(2) },
                  { label: t('editor.topP'), value: topP.toFixed(2) },
                  { label: t('editor.maxTokens'), value: String(maxTokens) },
                  { label: t('editor.thinkingSection'), value: thinkingLabel },
                  { label: t('editor.paragraphLimit'), value: replyLengthLabel },
                ]}
                background={backgroundUri ? { uri: backgroundUri, effect: bgEffect, intensity: bgIntensity } : null}
              />
            )}
          </Animated.View>
        </KeyboardAwareScrollView>
      ) : null}

      {photoOpen ? <StatusBar style="light" /> : null}
      {/* Opened with a zoom from the character list, so the header is drawn here rather
          than by the native bar; see DrawnFormScreenHeader. */}
      <DrawnFormScreenHeader
        title={title}
        overPhoto={photoSpread}
        right={
          // One button that turns from the pencil into the checkmark, so the change is
          // the symbol's own transition rather than a swap.
          <BarButton
            symbol={editing ? 'checkmark' : 'pencil'}
            fallback={editing ? 'checkmark' : 'pencil'}
            disabled={editing ? !canSave : !ready}
            onPress={editing ? onSave : () => setEditing(true)}
            accessibilityLabel={editing ? t('common.save') : t('action.edit')}
            prominent={editing}
            animateChange
          />
        }
      />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    chips: { marginBottom: 16 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
    aiButton: { alignSelf: 'flex-start', marginBottom: 12 },
    avatarBlock: { alignItems: 'center', marginBottom: 12 },
    avatarActions: { flexDirection: 'row', gap: 20, alignSelf: 'center', marginBottom: 24 },
    backgroundRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
    backgroundThumb: {
      width: 72,
      height: 96,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
    },
    backgroundActions: { flex: 1, gap: 12, alignItems: 'flex-start' },
    link: { color: colors.accent, fontSize: 15 },
    linkMuted: { color: colors.textMuted, fontSize: 15 },
    systemPromptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  })
