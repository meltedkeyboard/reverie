import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated, { useAnimatedReaction, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { Avatar } from '@/components/visuals/Avatar'
import { CharacterProfile } from '@/components/cast/CharacterProfile'
import { ButtonCell, InputCell, ListFooter, ListSection, SegmentCell, SliderCell, TextCell } from '@/components/lists/GroupedList'
import { BackgroundSection, ChipRowCell, SourceCell } from '@/components/lists/PictureCells'
import { ExpandingAvatar, useSpreadPush } from '@/components/cast/ExpandingAvatar'
import { BarButton, DrawnFormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useScreenPadding } from '@/components/chrome/GlassHeader'
import {
  DEFAULT_SAMPLING,
  deleteCharacter,
  getCharacter,
  saveCharacter,
  type BackgroundEffect,
  type ThinkingMode,
} from '@/db/characters'
import { useDatabase } from '@/db/provider'
import { useCardExport } from '@/hooks/features/useCardExport'
import { useImageSlot } from '@/hooks/features/useImageSlot'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/ui/haptics'
import { setAvatarCropDraft } from '@/lib/images/avatarCrop'
import { setGenDraft } from '@/lib/chat/genDraft'
import { acceptMoving, pickAvatar, pickBackground, type CropRect } from '@/lib/images/avatars'
import { movingKind } from '@/lib/images/media'
import { setBackgroundDraft } from '@/lib/images/backgroundDraft'
import type { ImageSource } from '@/lib/images/images'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { countLabel } from '@/lib/core/format'
import { alertError } from '@/lib/transfer/report'
import { type Colors, useColors, useStyles } from '@/theme'
import { isAndroid } from '@/lib/core/platform'

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
  const { exportTargets } = useCardExport()

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
  // The stored copy that is shown, the original beside it and the frame between them. A
  // fresh pick is kept apart as temporary files until Save.
  const [avatarOriginal, setAvatarOriginal] = useState<string | null>(null)
  const [avatarCrop, setAvatarCrop] = useState<string | null>(null)
  const avatarSlot = useImageSlot('avatars')
  // The avatar as it was before Remove, put back by Return until another one is picked or
  // the editor is saved.
  const [removedAvatar, setRemovedAvatar] = useState<{
    file: string | null
    original: string | null
    crop: string | null
    picked: ReturnType<typeof avatarSlot.snapshot>
  } | null>(null)
  const [temperature, setTemperature] = useState<number>(DEFAULT_SAMPLING.temperature)
  const [maxTokens, setMaxTokens] = useState<number>(DEFAULT_SAMPLING.maxTokens)
  const [topP, setTopP] = useState<number>(DEFAULT_SAMPLING.topP)
  const [replyLimit, setReplyLimit] = useState<number | null>(null)
  const [thinking, setThinking] = useState<ThinkingMode>('auto')
  const [background, setBackground] = useState<string | null>(null)
  const [backgroundOriginal, setBackgroundOriginal] = useState<string | null>(null)
  const [backgroundCrop, setBackgroundCrop] = useState<string | null>(null)
  const bgSlot = useImageSlot('backgrounds')
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>('blur')
  const [bgIntensity, setBgIntensity] = useState(0.5)
  const [bgBubbleTransparency, setBgBubbleTransparency] = useState(0.3)
  // The greeting before the generated one replaced it, until it is edited by hand.
  const [beforeGreeting, setBeforeGreeting] = useState<string | null>(null)
  // What the prompt was before the last AI result replaced it, until the user edits the
  // prompt by hand.
  const [beforeGen, setBeforeGen] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    getCharacter(db, Number(id)).then((found) => {
      if (!found) return router.back()
      setName(found.name)
      setSystemPrompt(found.systemPrompt)
      setGreeting(found.greeting)
      setAvatar(found.avatar)
      setAvatarOriginal(found.avatarOriginal)
      setAvatarCrop(found.avatarCrop)
      setTemperature(found.temperature)
      setMaxTokens(found.maxTokens)
      setTopP(found.topP)
      setReplyLimit(found.replyLimit)
      setThinking(found.thinking)
      setBackground(found.background)
      setBackgroundOriginal(found.backgroundOriginal)
      setBackgroundCrop(found.backgroundCrop)
      setBgEffect(found.backgroundEffect)
      setBgIntensity(found.backgroundIntensity)
      setBgBubbleTransparency(found.backgroundBubbleTransparency)
      avatarSlot.remember({ file: found.avatar, original: found.avatarOriginal })
      bgSlot.remember({ file: found.background, original: found.backgroundOriginal })
      setReady(true)
    })
  }, [db, id, isNew, router])

  const canSave = ready && !saving && name.trim().length > 0

  // Frames a still picture on its own screen. `original` is what gets stored beside the
  // framed copy: a temporary file for a fresh pick, or null when the stored one is reframed.
  const openCrop = (uri: string, crop: CropRect | null, original: string | null) => {
    setAvatarCropDraft({
      uri,
      crop,
      onDone: (framed, rect) => {
        setRemovedAvatar(null)
        avatarSlot.setFramed(framed, rect, original)
        if (original) setAvatarOriginal(null)
      },
    })
    router.push('/avatar-crop')
  }

  const onPickAvatar = async (source: ImageSource) => {
    try {
      const file = await pickAvatar(source)
      if (!file) return
      // A GIF or a video keeps its motion, so it skips the crop and is shown by its middle.
      if (acceptMoving(file)) {
        setRemovedAvatar(null)
        avatarSlot.setUnframed(file)
        setAvatarOriginal(null)
        return
      }
      openCrop(file, null, file)
    } catch (err) {
      alertError(t('editor.avatarFailedTitle'), err)
    }
  }

  const onRecropAvatar = () => {
    const source = avatarSlot.adjustSource({ file: avatar, original: avatarOriginal, crop: avatarCrop })
    if (source) openCrop(source.uri, source.crop, source.original)
  }

  const onClearAvatar = () => {
    setRemovedAvatar({ file: avatar, original: avatarOriginal, crop: avatarCrop, picked: avatarSlot.snapshot() })
    avatarSlot.clearPicked()
    setAvatar(null)
    setAvatarOriginal(null)
  }

  const onRestoreAvatar = () => {
    if (!removedAvatar) return
    setAvatar(removedAvatar.file)
    setAvatarOriginal(removedAvatar.original)
    setAvatarCrop(removedAvatar.crop)
    avatarSlot.restore(removedAvatar.picked)
    setRemovedAvatar(null)
  }

  // The picture now behind the chat: a fresh pick, else the one already stored.
  const backgroundUri = bgSlot.shown(background)

  // The effect is tried out on its own screen; what it returns is kept until Save.
  // `original` is what gets stored beside the framed copy, as for the avatar.
  const openBackground = (uri: string, crop: CropRect | null, original: string | null) => {
    setBackgroundDraft({
      uri,
      crop,
      characterName: name.trim(),
      effect: bgEffect,
      intensity: bgIntensity,
      bubbleTransparency: bgBubbleTransparency,
      onDone: (result) => {
        bgSlot.setFramed(result.uri, result.crop, original)
        if (original) setBackgroundOriginal(null)
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
      if (uri) openBackground(uri, null, uri)
    } catch (err) {
      alertError(t('background.failedTitle'), err)
    }
  }

  const onAdjustBackground = () => {
    const source = bgSlot.adjustSource({ file: background, original: backgroundOriginal, crop: backgroundCrop })
    if (source) openBackground(source.uri, source.crop, source.original)
  }

  const onClearBackground = () => {
    bgSlot.clearPicked()
    setBackground(null)
    setBackgroundOriginal(null)
  }

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const nextAvatarValue = await avatarSlot.persist({ file: avatar, original: avatarOriginal, crop: avatarCrop })
      const nextBackgroundValue = await bgSlot.persist({ file: background, original: backgroundOriginal, crop: backgroundCrop })
      const { file: nextAvatar, original: nextAvatarOriginal, crop: nextAvatarCrop } = nextAvatarValue
      const { file: nextBackground, original: nextBackgroundOriginal, crop: nextBackgroundCrop } = nextBackgroundValue
      await saveCharacter(db, isNew ? null : Number(id), {
        name,
        avatar: nextAvatar,
        avatarOriginal: nextAvatarOriginal,
        avatarCrop: nextAvatarCrop,
        systemPrompt,
        greeting,
        temperature,
        maxTokens,
        topP,
        replyLimit,
        thinking,
        background: nextBackground,
        backgroundOriginal: nextBackgroundOriginal,
        backgroundCrop: nextBackgroundCrop,
        backgroundEffect: bgEffect,
        backgroundIntensity: bgIntensity,
        backgroundBubbleTransparency: bgBubbleTransparency,
      })
      avatarSlot.settle(nextAvatarValue)
      setRemovedAvatar(null)
      bgSlot.settle(nextBackgroundValue)
      if (!asProfile) return router.back()
      // Back to the profile, now showing what was saved.
      setAvatar(nextAvatar)
      setAvatarOriginal(nextAvatarOriginal)
      setAvatarCrop(nextAvatarCrop)
      setBackground(nextBackground)
      setBackgroundOriginal(nextBackgroundOriginal)
      setBackgroundCrop(nextBackgroundCrop)
      setSaving(false)
      setEditing(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      setSaving(false)
      alertError(t('editor.saveFailedTitle'), err)
    }
  }

  const confirmDelete = () => {
    confirmDeletion({
      title: t('editor.deleteConfirmTitle'),
      message: t('editor.deleteConfirmMessage'),
      onConfirm: async () => {
        await deleteCharacter(db, Number(id))
        avatarSlot.removeStored()
        bgSlot.removeStored()
        router.dismissTo('/')
      },
    })
  }

  // The generators open as a form sheet of the stack, app/generate.tsx.
  const openPromptGen = () => {
    setGenDraft({ kind: 'prompt', name, currentPrompt: systemPrompt, onApply: applyGenerated })
    router.push('/generate')
  }

  const openGreetingGen = () => {
    setGenDraft({ kind: 'greeting', name, systemPrompt, currentGreeting: greeting, onApply: applyGreeting })
    router.push('/generate')
  }

  const applyGreeting = (text: string) => {
    setBeforeGreeting(greeting)
    setGreeting(text)
  }

  const undoGreeting = () => {
    if (beforeGreeting === null) return
    setGreeting(beforeGreeting)
    setBeforeGreeting(null)
  }

  const applyGenerated = (prompt: string) => {
    setBeforeGen(systemPrompt)
    setSystemPrompt(prompt)
  }

  const undoGenerated = () => {
    if (beforeGen === null) return
    setSystemPrompt(beforeGen)
    setBeforeGen(null)
  }

  const photoUri = avatarSlot.shown(avatar)
  const hasPhoto = Boolean(photoUri)
  const canRecrop = hasPhoto && !movingKind(photoUri!)
  // The character's own name heads the screen once it has one.
  const title = name.trim() || (isNew ? t('editor.newCharacterTitle') : t('editor.characterTitle'))

  const thinkingLabel = THINKING_OPTIONS.find((option) => option.value === thinking)?.label ?? ''
  const replyLengthLabel = replyLimit
    ? countLabel(replyLimit, 'paragraph', locale)
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
  // Android has no overscroll to pull on, so a downward drag that starts with the page at its
  // top is told apart from a scroll by hand: the gesture only takes the touch then, and
  // leaves ordinary scrolling alone.
  const pull = useSharedValue(0)
  const touchFrom = useSharedValue({ x: 0, y: 0 })
  const androidPull = Gesture.Pan()
    .manualActivation(true)
    .enabled(hasPhoto)
    .onTouchesDown((e) => {
      const touch = e.allTouches[0]
      touchFrom.value = { x: touch.absoluteX, y: touch.absoluteY }
    })
    .onTouchesMove((e, manager) => {
      const touch = e.allTouches[0]
      const dx = touch.absoluteX - touchFrom.value.x
      const dy = touch.absoluteY - touchFrom.value.y
      if (scrollY.value <= 1 && dy > 12 && dy > 2 * Math.abs(dx)) manager.activate()
      else if (Math.abs(dx) > 12 || dy < -8) manager.fail()
    })
    .onUpdate((e) => {
      pull.value = Math.max(0, e.translationY)
    })
    .onFinalize(() => {
      pull.value = 0
    })
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
        <PullHost gesture={isAndroid ? androidPull : null}>
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
          onScroll={onScroll}
        >
          <View style={styles.avatarBlock}>
            {/* In the profile a tap on the photo opens it and a pull spreads it out. */}
            {editing ? (
              // In the editor the circle stands on the left and what is done with it on
              // the right; the spreading photo is the profile's.
              <View style={styles.editorAvatar}>
                <Avatar name={name} file={avatar} uri={avatarSlot.uri} size={96} viewable={hasPhoto} />
                <View style={styles.editorAvatarActions}>
                  <ListSection>
                    <SourceCell label={hasPhoto ? t('editor.changePhoto') : t('editor.choosePhoto')} onPick={onPickAvatar} />
                    {hasPhoto || removedAvatar ? (
                      <ChipRowCell
                        actions={[
                          ...(canRecrop
                            ? [{ label: t('editor.recropPhoto'), icon: { symbol: 'crop', fallback: 'crop-outline' } as const, onPress: onRecropAvatar }]
                            : []),
                          removedAvatar
                            ? {
                                label: t('editor.restorePhoto'),
                                icon: { symbol: 'arrow.uturn.backward', fallback: 'arrow-undo-outline' } as const,
                                onPress: onRestoreAvatar,
                              }
                            : {
                                label: t('editor.removePhoto'),
                                icon: { symbol: 'trash', fallback: 'trash-outline' } as const,
                                onPress: onClearAvatar,
                                ink: colors.danger,
                              },
                        ]}
                      />
                    ) : null}
                  </ListSection>
                </View>
              </View>
            ) : photoUri ? (
              <ExpandingAvatar
                name={name}
                uri={photoUri}
                scrollY={scrollY}
                dragging={dragging}
                progress={photoSpread}
                pull={isAndroid ? pull : undefined}
                top={padding.paddingTop}
                side={padding.paddingHorizontal}
              />
            ) : (
              <Avatar name={name} file={avatar} size={96} viewable={false} />
            )}
          </View>
          {/* Pushed down by a transform while the photo spreads: animating the height of
              the block above would lay out the whole form again on every frame. */}
          <Animated.View style={pushed}>
            {editing ? (
              <>
                <ListSection>
                  <InputCell
                    label={t('editor.nameLabel')}
                    value={name}
                    onChangeText={setName}
                    placeholder={t('editor.namePlaceholder')}
                    autoCapitalize="sentences"
                  />
                </ListSection>

                <ListSection header={t('editor.systemPromptLabel')} footer={t('editor.systemPromptHint')}>
                  <TextCell
                    title={t('editor.systemPromptLabel')}
                    value={systemPrompt}
                    placeholder={t('editor.systemPromptPlaceholder')}
                    onChangeText={(v) => {
                      setSystemPrompt(v)
                      setBeforeGen(null)
                    }}
                    lines={6}
                  />
                  <ButtonCell
                    label={systemPrompt.trim() ? t('editor.improveWithAi') : t('editor.generateWithAi')}
                    onPress={openPromptGen}
                  />
                  {beforeGen !== null ? <ButtonCell label={t('editor.undoGenerated')} onPress={undoGenerated} /> : null}
                </ListSection>

                <ListSection header={t('editor.greetingLabel')} footer={t('editor.greetingHint')}>
                  <TextCell
                    title={t('editor.greetingLabel')}
                    value={greeting}
                    placeholder={t('editor.greetingPlaceholder')}
                    onChangeText={(v) => {
                      setGreeting(v)
                      setBeforeGreeting(null)
                    }}
                  />
                  {/* Written from the system prompt, so there must be one first. */}
                  <ButtonCell
                    label={t('editor.generateGreeting')}
                    onPress={openGreetingGen}
                    disabled={!systemPrompt.trim()}
                  />
                  {beforeGreeting !== null ? <ButtonCell label={t('editor.undoGenerated')} onPress={undoGreeting} /> : null}
                </ListSection>

                <BackgroundSection
                  uri={backgroundUri}
                  effect={bgEffect}
                  intensity={bgIntensity}
                  onPick={onPickBackground}
                  onAdjust={onAdjustBackground}
                  onClear={onClearBackground}
                />

                <ListSection
                  header={t('editor.genParamsSection')}
                  footer={
                    <>
                      <ListFooter>{t('editor.replyLengthHint')}</ListFooter>
                      <ListFooter>{t('editor.thinkingHint')}</ListFooter>
                    </>
                  }
                >
                  <SliderCell
                    label={t('editor.temperature')}
                    value={temperature}
                    min={0}
                    max={2}
                    step={0.05}
                    digits={2}
                    onChange={(v) => setTemperature(Math.round(v * 100) / 100)}
                  />
                  <SliderCell label={t('editor.maxTokens')} value={maxTokens} min={100} max={4096} step={1} onChange={setMaxTokens} />
                  <SliderCell
                    label={t('editor.topP')}
                    value={topP}
                    min={0.1}
                    max={1}
                    step={0.01}
                    digits={2}
                    onChange={(v) => setTopP(Math.round(v * 100) / 100)}
                  />
                  <SliderCell
                    label={t('editor.paragraphLimit')}
                    value={replyLimit ?? 0}
                    min={0}
                    max={6}
                    step={1}
                    formatValue={(v) => (v === 0 ? t('editor.unlimited') : countLabel(v, 'paragraph', locale))}
                    onChange={(v) => setReplyLimit(v === 0 ? null : v)}
                  />
                  {/* Segments rather than a menu: the system menu jumps as it closes on iOS 26 and 27. */}
                  <SegmentCell label={t('editor.thinkingSection')} options={THINKING_OPTIONS} value={thinking} onChange={setThinking} />
                </ListSection>

                {!isNew ? (
                  <ListSection>
                    <ButtonCell danger label={t('editor.deleteCharacter')} onPress={confirmDelete} />
                  </ListSection>
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
                // Saves the card as it is stored, so edits not yet saved are not in it.
                exportItems={isNew ? undefined : exportTargets(() => getCharacter(db, Number(id)))}
              />
            )}
          </Animated.View>
        </KeyboardAwareScrollView>
        </PullHost>
      ) : null}

      {photoOpen ? <StatusBar style="light" /> : null}
      {/* Opened with a zoom from the character list, so the header is drawn here rather
          than by the native bar; see DrawnFormScreenHeader. */}
      <DrawnFormScreenHeader
        title={title}
        overPhoto={photoSpread}
        right={
          <View style={styles.headerButtons}>
            {/* One button that turns from the pencil into the checkmark, so the change is
                the symbol's own transition rather than a swap. */}
            <BarButton
              symbol={editing ? 'checkmark' : 'pencil'}
              fallback={editing ? 'checkmark' : 'pencil'}
              disabled={editing ? !canSave : !ready}
              onPress={editing ? onSave : () => setEditing(true)}
              accessibilityLabel={editing ? t('common.save') : t('action.edit')}
              prominent={editing}
              animateChange
            />
          </View>
        }
      />
    </View>
  )
}

// Android only: carries the gesture that stands in for the overscroll pull of iOS. Elsewhere
// it renders its children as they are.
function PullHost({ gesture, children }: { gesture: ReturnType<typeof Gesture.Pan> | null; children: React.ReactNode }) {
  if (!gesture) return <>{children}</>
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    avatarBlock: { alignItems: 'center', marginBottom: 24 },
    editorAvatar: { flexDirection: 'row', alignItems: 'center', gap: 16, alignSelf: 'stretch' },
    // The group's own bottom margin is the block's.
    editorAvatarActions: { flex: 1, marginBottom: -28 },
  })
