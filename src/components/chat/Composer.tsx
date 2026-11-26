import { Icon } from '@/components/visuals/Icon'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type TextInputInstance,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { KeyboardController, KeyboardStickyView } from 'react-native-keyboard-controller'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { BlurBar, EdgeFade } from '../chrome/BarChrome'
import { useChatWallpaperAccent, type ChatLook } from '../chrome/ChatChrome'
import { useChatDrawer } from '../chrome/ChatDrawer'
import { GlassSurface, useGlassStyles } from '../chrome/Glass'
import { useInputColors } from '../controls/Field'
import { IconButton } from '../controls/IconButton'
import { ImageLink, useImageGroup, type ImageGroup } from '../visuals/ImageLink'
import { SFIcon } from '../visuals/SFIcon'
import { AttachSheet, loadAttachGalleries, loadRecentPictures } from './AttachMenu'
import type { MessageImage } from '@/db/messages'
import type { Persona } from '@/db/personas'
import { isSuggestionImagesReferenceEnabled } from '@/db/prefs/suggestions'
import { useDatabase } from '@/db/provider'
import { reorderFeel } from '@/hooks/features/useReorder'
import { CHAT_COLUMN } from '@/hooks/util/useLayoutMode'
import { useTranslation } from '@/i18n'
import { finishAttachSession, setAttachAfter, setAttachSession, type AttachSession } from '@/lib/chat/attachSession'
import { isAndroid, isIOS, isWeb } from '@/lib/core/platform'
import { pickMessageImages, pictureUri } from '@/lib/images/attachments'
import type { ImageSource } from '@/lib/images/images'
import { promptText } from '@/lib/ui/dialogs'
import * as Haptics from '@/lib/ui/haptics'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { alertError } from '@/lib/transfer/report'
import { ON_ACCENT, useColors, useStyles, useTheme, type Colors } from '@/theme'

type Props = {
  height: SharedValue<number>
  top?: SharedValue<number>
  generating: boolean
  editing: { id: number; text: string } | null
  accessory?: React.ReactNode
  onSend: (text: string, images: MessageImage[]) => void
  onStop: () => void
  onContinue?: () => void
  onSubmitEdit: (text: string) => void
  onCancelEdit: () => void
  toolbar?: React.ReactNode
  toolbarActive?: boolean
  placeholder?: string
  onContinueLongPress?: () => void
  hushed?: boolean
  initialText?: string
  onTextChange?: (text: string) => void
  onImagesChange?: (images: MessageImage[]) => void
  resetKey?: string | number
  autoFocus?: boolean
  suggestion?: string | null
  onSuggestionTaken?: () => void
  onSuggestionDismissed?: () => void
  onSuggestionRefine?: (wish: string, images?: MessageImage[]) => void
  thinking?: boolean
  onToggleThinking?: (thinking: boolean) => void
  persona?: Persona | null
  personaId?: number | null
  onSelectPersona?: (personaId: number | null) => void
  direction?: string | null
  onSetDirection?: (direction: string) => void
  suggestionDirection?: string | null
  onSetSuggestionDirection?: (suggestionDirection: string) => void
  fade?: boolean
  look?: ChatLook
  cast?: { id: number; name: string }[]
}

export function Composer({
  height,
  top,
  fade = true,
  look,
  cast,
  generating,
  editing,
  accessory,
  onSend,
  onStop,
  onContinue,
  onSubmitEdit,
  onCancelEdit,
  toolbar,
  toolbarActive,
  placeholder,
  initialText = '',
  onTextChange,
  onImagesChange,
  resetKey,
  autoFocus = false,
  onContinueLongPress,
  hushed = false,
  suggestion,
  onSuggestionTaken,
  onSuggestionDismissed,
  onSuggestionRefine,
  thinking,
  onToggleThinking,
  persona,
  personaId,
  onSelectPersona,
  direction,
  onSetDirection,
  suggestionDirection,
  onSetSuggestionDirection,
}: Props) {
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const colors = useColors()
  const wallpaperColors = useChatWallpaperAccent(look)
  const effectiveAccent = wallpaperColors?.accent ?? colors.accent
  const { scheme } = useTheme()
  const inputColors = useInputColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const router = useRouter()
  const db = useDatabase()
  const drawer = useChatDrawer()

  const [text, setText] = useState(initialText)
  const textRef = useRef(text)
  textRef.current = text

  useEffect(() => {
    if (!editing) onTextChange?.(text)
  }, [text])

  const stash = useRef('')
  const inputRef = useRef<TextInputInstance>(null)
  const [focused, setFocused] = useState(false)
  const [wraps, setWraps] = useState(false)
  const [opened, setOpened] = useState(false)
  const hadText = useRef(false)
  const picturedRef = useRef(false)
  const suggestingRef = useRef(false)

  const [images, setImages] = useState<MessageImage[]>([])
  useEffect(() => {
    onImagesChange?.(images)
  }, [images, onImagesChange])
  picturedRef.current = images.length > 0 && !editing

  const [picking, setPicking] = useState(false)
  const imageUris = useMemo(() => images.map(pictureUri), [images])
  const thumbs = useImageGroup()

  const shownKey = useRef(resetKey)
  useEffect(() => {
    if (shownKey.current === resetKey) return
    shownKey.current = resetKey
    hadText.current = false
    setText(initialText)
    setImages([])
    setOpened(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // Prevent browser from scrolling the outer viewport when focusing an off-screen swap.
  useEffect(() => {
    if (!isWeb || !autoFocus) return
    const node = inputRef.current as unknown as HTMLElement | null
    node?.focus({ preventScroll: true })
  }, [autoFocus])

  useEffect(() => {
    if (!editing) return
    stash.current = textRef.current
    setText(editing.text)
    inputRef.current?.focus()
    return () => setText(stash.current)
  }, [editing?.id])

  useEffect(() => {
    Haptics.setComposerHasText(Boolean(text.trim()))
    if (text) hadText.current = true
    else {
      if (!suggestingRef.current) setWraps(false)
      if (hadText.current) {
        hadText.current = false
        setOpened(false)
      }
    }
    return () => Haptics.setComposerHasText(false)
  }, [text])

  const value = text.trim()
  const suggesting = !editing && !value && !!suggestion
  suggestingRef.current = suggesting

  const [ghostHeight, setGhostHeight] = useState(0)
  const [inputH, setInputH] = useState(30)
  useEffect(() => {
    if (!suggesting) {
      if (!textRef.current) setWraps(false)
      setGhostHeight(0)
      Haptics.setSuggestionOverflowed(false)
    }
  }, [suggesting])

  // Remounting after inserting a long suggestion resets iOS multiline intrinsic height.
  const [inputKey, setInputKey] = useState(0)
  const inserted = useRef(false)
  useEffect(() => {
    if (inputKey) inputRef.current?.focus()
  }, [inputKey])

  const change = (next: string) => {
    Haptics.setComposerHasText(Boolean(next.trim()))
    if (!textRef.current && next.includes('\n') && !next.trim() && !picturedRef.current) {
      setOpened(true)
      inputRef.current?.setNativeProps?.({ text: '' })
      return
    }
    setText(next)
  }

  const takeSuggestion = () => {
    if (!suggestion) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setText(suggestion)
    inserted.current = true
    onSuggestionTaken?.()
    inputRef.current?.focus()
  }

  const dismissSuggestion = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onSuggestionDismissed?.()
  }

  const refineSuggestion = async () => {
    if (!suggestion) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const imagesRefEnabled = await isSuggestionImagesReferenceEnabled(db)
    const imagesNote =
      imagesRefEnabled && images.length
        ? `\n\n${t('chat.refineSuggestionImagesNote', { count: images.length })}`
        : ''
    promptText({
      title: t('chat.refineSuggestionTitle'),
      message: `${t('chat.refineSuggestionMessage')}${imagesNote}`,
      confirmLabel: t('chat.refineConfirm'),
      scheme,
      onSubmit: (wish) => {
        const trimmed = wish.trim()
        if (trimmed || images.length) onSuggestionRefine?.(trimmed, images)
      },
    })
  }

  const [menuUp, setMenuUp] = useState(false)
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .enabled(suggesting && !menuUp)
    .activeOffsetX([-18, 18])
    .activeOffsetY(-18)
    .failOffsetY(14)
    .onEnd((e) => {
      if (e.translationY < -36 && Math.abs(e.translationY) > Math.abs(e.translationX)) {
        refineSuggestion()
      } else if (e.translationX > 48) {
        takeSuggestion()
      } else if (e.translationX < -48) {
        dismissSuggestion()
      }
    })

  const mode = editing
    ? value
      ? 'save'
      : 'idle'
    : generating
      ? 'stop'
      : value || images.length
        ? 'send'
        : onContinue
          ? 'continue'
          : 'idle'

  const docked = toolbar !== undefined && toolbar !== null && !editing

  const armed = useSharedValue(0)
  useEffect(() => {
    armed.value = withTiming(mode === 'idle' ? 0 : 1, { duration: 160 })
  }, [mode, armed])

  const buttonStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      armed.value,
      [0, 1],
      [docked ? 'transparent' : colors.surfaceRaised, effectiveAccent]
    ),
    transform: [{ scale: (docked ? 0.94 : 0.92) + armed.value * (docked ? 0.06 : 0.08) }],
  }))

  const onPress = () => {
    if (mode === 'stop') return onStop()
    if (mode === 'continue') return onContinue?.()
    if (mode === 'save') return onSubmitEdit(value)
    if (mode === 'send') {
      onSend(value, images)
      setText('')
      setImages([])
      if (inserted.current) {
        inserted.current = false
        setInputKey((key) => key + 1)
      } else if (value.includes('\n')) {
        inputRef.current?.clear()
      }
    }
  }

  const attach = async (source: ImageSource) => {
    setPicking(true)
    try {
      const picked = await pickMessageImages(source)
      if (picked.length) setImages((current) => [...current, ...picked])
    } catch (err) {
      alertError(t('composer.attachFailedTitle'), err)
    } finally {
      setPicking(false)
    }
  }

  const [menuShown, setMenuShown] = useState(false)
  const [session, setSession] = useState<AttachSession | null>(null)
  const restoreKeyboardOnClose = useRef(false)

  const openMenu = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setMenuUp(true)
    drawer?.suspend(true)
    const isKeyboardUp = KeyboardController.isVisible() || focused || !!inputRef.current?.isFocused?.()
    restoreKeyboardOnClose.current = isKeyboardUp

    if (isKeyboardUp) {
      inputRef.current?.blur?.()
      await KeyboardController.dismiss({ animated: true })
    }

    const [recents, galleries] = await Promise.all([loadRecentPictures(db), loadAttachGalleries(db, cast ?? [])])
    const next: AttachSession = {
      opened: Date.now(),
      look,
      recents,
      galleries,
      thinking,
      onToggleThinking,
      persona,
      personaId,
      onSelectPersona,
      direction,
      onSetDirection,
      suggestionDirection,
      onSetSuggestionDirection,
      onPick: (source) => {
        restoreKeyboardOnClose.current = false
        setTimeout(() => attach(source), 50)
      },
      onAttach: (pictures) =>
        setImages((current) => {
          const existing = new Set(current.map((p) => p.file))
          return [...current, ...pictures.filter((p) => !existing.has(p.file))]
        }),
      onGone: () => {
        setMenuUp(false)
        drawer?.suspend(false)
      },
      onClosed: () => {
        if (!restoreKeyboardOnClose.current) return
        restoreKeyboardOnClose.current = false
        setTimeout(() => inputRef.current?.focus(), 50)
      },
    }
    setAttachSession(next)
    if (isIOS) {
      router.push('/attach')
    } else {
      setSession(next)
      setMenuShown(true)
    }
  }

  const closeMenu = (then?: () => void) => {
    setAttachAfter(then ?? null)
    setMenuShown(false)
  }

  const pictured = images.length > 0 && !editing
  const expanded = docked || opened || pictured || wraps || text.includes('\n') || (suggesting && !!suggestion?.includes('\n'))

  const expandAnim = useSharedValue(expanded ? 1 : 0)
  useEffect(() => {
    expandAnim.value = withTiming(expanded ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) })
  }, [expanded, expandAnim])

  const narrow = useSharedValue(0)
  const resting = !focused && !expanded
  useEffect(() => {
    narrow.value = withTiming(resting ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) })
  }, [resting, narrow])
  const narrowStyle = useAnimatedStyle(() => ({ paddingHorizontal: narrow.value * NARROW_INSET }))

  const placeholderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: editing ? 0 : expandAnim.value * (14 - SIDE_PAD) }],
  }))
  const spacerStyle = useAnimatedStyle(() => ({
    height: expandAnim.value * (SIDE + 2),
  }))

  // Fixed at the resting capsule width so widening the field never flips wraps back.
  const sidePad = Math.max(BAR_PAD_SIDE, Math.max(insets.left, insets.right))
  const measureWidth = Math.max(
    0,
    Math.min(windowWidth - insets.left - insets.right, CHAT_COLUMN + 2 * sidePad) -
      2 * (sidePad + NARROW_INSET) -
      (FIELD_PAD + (editing ? 14 : SIDE_PAD)) -
      (FIELD_PAD + SIDE_PAD)
  )

  const plus = editing ? null : (
    <Pressable
      onPress={() => (menuShown ? closeMenu() : openMenu())}
      disabled={picking}
      hitSlop={4}
      accessibilityLabel={t('attach.title')}
      style={[styles.plus, picking && { opacity: 0.55 }]}
    >
      <Icon name="add" size={27} color={colors.text} />
    </Pressable>
  )

  const sendButton = (
    <Pressable
      onPress={onPress}
      onLongPress={mode === 'continue' ? onContinueLongPress : undefined}
      disabled={mode === 'idle'}
      hitSlop={docked ? 8 : 6}
      accessibilityLabel={mode === 'continue' ? t('chat.continueAccessibility') : undefined}
      style={({ pressed }) => (pressed && mode !== 'idle' ? styles.pressed : null)}
    >
      <Animated.View style={[styles.send, docked && styles.sendDocked, buttonStyle]}>
        <SFIcon
          name={ICONS[mode].sf}
          fallback={ICONS[mode].fallback}
          size={docked ? (mode === 'stop' ? 13 : 17) : mode === 'stop' ? 15 : 20}
          color={mode === 'idle' ? colors.textFaint : ON_ACCENT}
          onAccent={mode !== 'idle'}
        />
      </Animated.View>
    </Pressable>
  )

  const barH = useSharedValue(0)
  const accessoryH = useSharedValue(0)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const emptyBarH = BAR_PAD_TOP + BAR_PAD_BOTTOM + insets.bottom + 2 * EDGE + SIDE
  const baseBarH = useRef(emptyBarH)
  const prevBottomInset = useRef(insets.bottom)
  if (prevBottomInset.current !== insets.bottom) {
    baseBarH.current += insets.bottom - prevBottomInset.current
    prevBottomInset.current = insets.bottom
  }

  useEffect(() => {
    if (pictured || editing || docked) return
    const contentExtra = suggesting
      ? ghostHeight > 0
        ? Math.max(0, Math.min(INPUT_MAX_HEIGHT, ghostHeight + 8) - EMPTY_INPUT_HEIGHT)
        : 0
      : text
        ? Math.max(0, Math.min(INPUT_MAX_HEIGHT, inputH) - EMPTY_INPUT_HEIGHT)
        : 0
    const targetH = baseBarH.current + (expanded ? SIDE + 2 : 0) + contentExtra
    height.value = withTiming(targetH, { duration: 220, easing: Easing.out(Easing.cubic) })
  }, [expanded, pictured, editing, docked, suggesting, ghostHeight, text, inputH, insets.bottom, height])

  useEffect(() => {
    if (accessory) return
    accessoryH.value = 0
    if (top && barH.value > 0) top.value = barH.value
  }, [accessory, accessoryH, barH, top])

  const onBarLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    barH.value = h
    if (top) top.value = h + accessoryH.value
    if (pictured || editing || docked) {
      height.value = h
    } else if (!expandedRef.current && expandAnim.value === 0 && !textRef.current && !suggestingRef.current) {
      // Only sample baseline height while empty; wrapped text/suggestions lay out before onTextLayout flips `expanded`.
      baseBarH.current = h
      height.value = h
    }
  }

  const onAccessoryLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    accessoryH.value = h
    if (top) top.value = barH.value + h
  }

  const row = (
    <Animated.View ref={drawer?.guard} style={[styles.row, narrowStyle]}>
      <GlassSurface
        interactive
        style={[styles.field, hushed && styles.hushed]}
        fallbackStyle={glass.solid}
      >
        {editing ? (
          <View style={styles.banner}>
            <Icon name="create-outline" size={15} color={effectiveAccent} />
            <Text style={styles.bannerText}>{t('chat.editingMessage')}</Text>
            <IconButton name="close" size={18} color={colors.textMuted} onPress={onCancelEdit} style={styles.bannerClose} />
          </View>
        ) : null}

        {pictured ? (
          <ReorderableList
            horizontal
            data={images}
            keyExtractor={(image) => image.file}
            onReorder={({ from, to }) => setImages((current) => reorderItems(current, from, to))}
            {...reorderFeel}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: image, index }) => (
              <AttachedThumb
                image={image}
                uri={imageUris[index]}
                index={index}
                group={thumbs}
                onRemove={() => setImages((current) => current.filter((p) => p.file !== image.file))}
              />
            )}
          />
        ) : null}

        <GestureDetector gesture={swipe}>
          <View style={styles.inputClip}>
            <View
              style={{
                paddingLeft: expanded || editing ? 14 : SIDE_PAD,
                paddingRight: expanded ? 14 : SIDE_PAD,
                paddingTop: docked ? 12 : 8,
              }}
            >
              <View>
                <TextInput
                  key={inputKey}
                  ref={inputRef}
                  value={text}
                  onChangeText={change}
                  onKeyPress={(e) => {
                    if (e.nativeEvent.key === 'Enter' && !textRef.current && !picturedRef.current) {
                      setOpened(true)
                      inputRef.current?.setNativeProps?.({ text: '' })
                    } else if (e.nativeEvent.key === 'Backspace' && !textRef.current) {
                      setOpened(false)
                    }
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height
                    setInputH((prev) => (Math.abs(prev - h) > 0.5 ? h : prev))
                  }}
                  placeholder={suggesting ? '' : (placeholder ?? t('chat.messagePlaceholder'))}
                  {...inputColors}
                  placeholderTextColor="transparent"
                  selectionColor={effectiveAccent}
                  multiline
                  numberOfLines={isWeb ? 1 : undefined}
                  autoFocus={autoFocus && !isWeb}
                  accessibilityHint={suggesting ? t('chat.suggestionHint') : undefined}
                  style={[
                    styles.input,
                    !text && !suggesting && styles.inputEmpty,
                    suggesting && { minHeight: ghostHeight + 8 },
                  ]}
                />
                {suggesting ? (
                  <View style={styles.ghost} pointerEvents="none">
                    <Text
                      style={styles.ghostText}
                      numberOfLines={GHOST_MAX_LINES}
                      ellipsizeMode="tail"
                      onLayout={(e) => setGhostHeight(e.nativeEvent.layout.height)}
                      onTextLayout={(e) => Haptics.setSuggestionOverflowed(e.nativeEvent.lines.length > GHOST_MAX_LINES)}
                    >
                      {suggestion}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            {!text && !suggesting ? (
              <Animated.Text
                style={[
                  styles.placeholder,
                  { left: editing ? 14 : SIDE_PAD, top: docked ? 12 : 8, color: inputColors.placeholderTextColor },
                  placeholderStyle,
                ]}
                numberOfLines={1}
                pointerEvents="none"
              >
                {placeholder ?? t('chat.messagePlaceholder')}
              </Animated.Text>
            ) : null}
          </View>
        </GestureDetector>

        {docked ? (
          <View style={styles.tools}>
            {plus}
            <View style={[styles.dockGroup, toolbarActive && styles.dockGroupActive]}>
              {toolbar}
              {sendButton}
            </View>
          </View>
        ) : (
          <>
            <Animated.View style={spacerStyle} />
            <View style={styles.plusAt} pointerEvents="box-none">
              {plus}
            </View>
            <View style={styles.sendAt} pointerEvents="box-none">
              {sendButton}
            </View>
            <Text
              style={[styles.measure, { left: FIELD_PAD + (editing ? 14 : SIDE_PAD), width: measureWidth }]}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onTextLayout={(e) => setWraps(e.nativeEvent.lines.length > 1)}
            >
              {text || (suggesting ? suggestion : '')}
            </Text>
          </>
        )}
      </GlassSurface>
    </Animated.View>
  )

  const barPadding = {
    paddingBottom: insets.bottom + BAR_PAD_BOTTOM,
    paddingLeft: Math.max(BAR_PAD_SIDE, insets.left + 4),
    paddingRight: Math.max(BAR_PAD_SIDE, insets.right + 4),
  }

  return (
    <KeyboardStickyView style={styles.dock} offset={{ closed: 0, opened: insets.bottom }} pointerEvents="box-none">
      {accessory ? (
        <View style={styles.accessory} pointerEvents="box-none" onLayout={onAccessoryLayout}>
          {accessory}
        </View>
      ) : null}

      {isWeb || liquidGlass || isAndroid ? (
        <View style={[styles.floatingBar, barPadding]} onLayout={onBarLayout} pointerEvents="box-none">
          {!isWeb && fade ? <EdgeFade edge="bottom" style={styles.fade} /> : null}
          {row}
        </View>
      ) : (
        <BlurBar edge="bottom" style={[styles.bar, barPadding]} onLayout={onBarLayout}>
          {row}
        </BlurBar>
      )}

      {!isIOS ? <AttachSheet visible={menuShown} session={session} onClose={closeMenu} onDismissed={() => finishAttachSession()} /> : null}
    </KeyboardStickyView>
  )
}

export function ComposerFloat({ top, children }: { top: SharedValue<number>; children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const styles = useStyles(createStyles)
  const style = useAnimatedStyle(() => ({ bottom: withTiming(top.value, { duration: 180, easing: Easing.out(Easing.cubic) }) }))
  return (
    <KeyboardStickyView style={styles.dock} offset={{ closed: 0, opened: insets.bottom }} pointerEvents="box-none">
      <Animated.View style={[styles.floatSlot, style]} pointerEvents="box-none">
        {children}
      </Animated.View>
    </KeyboardStickyView>
  )
}

// Only a transform, since Liquid Glass renders wrongly under a fading parent.
export function ComposerSwap({ id, children }: { id: string; children: React.ReactNode }) {
  const { height: screenHeight } = useWindowDimensions()
  const [shownId, setShownId] = useState(id)
  const shown = useRef(children)
  if (id === shownId) shown.current = children
  const offset = useSharedValue(0)
  const distance = isWeb ? 72 : screenHeight * 0.6

  useEffect(() => {
    if (id === shownId) return
    offset.value = withTiming(distance, { duration: 170, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) scheduleOnRN(setShownId, id)
    })
  }, [id, shownId, distance, offset])

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    offset.value = withSpring(0, { damping: 17, stiffness: 210, mass: 0.9 })
  }, [shownId, offset])

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    ...(isWeb ? { opacity: Math.min(1, Math.max(0, 1 - offset.value / distance)) } : null),
  }))
  return (
    <Animated.View key={shownId} style={[StyleSheet.absoluteFill, swapStyle, style]} pointerEvents="box-none">
      {shown.current}
    </Animated.View>
  )
}

const swapStyle = { zIndex: 1 }

const SIDE = 40
const EMPTY_INPUT_HEIGHT = 30
const INPUT_MAX_HEIGHT = 180
const GHOST_MAX_HEIGHT = 164
const GHOST_MAX_LINES = Math.floor(GHOST_MAX_HEIGHT / 22)
const BAR_PAD_TOP = 8
const BAR_PAD_BOTTOM = 8
const BAR_PAD_SIDE = 10
const EDGE = 6
const FIELD_PAD = 7
const SIDE_PAD = EDGE + SIDE + 8 - FIELD_PAD
const NARROW_INSET = 16

const ICONS = {
  idle: { sf: 'arrow.up', fallback: 'arrow-up' },
  send: { sf: 'arrow.up', fallback: 'arrow-up' },
  save: { sf: 'checkmark', fallback: 'checkmark' },
  stop: { sf: 'stop.fill', fallback: 'stop' },
  continue: { sf: 'forward.fill', fallback: 'play-forward' },
} as const

const THUMB_RADIUS = 14

type AttachedThumbProps = { image: MessageImage; uri: string; index: number; group: ImageGroup; onRemove: () => void }

function AttachedThumb({ image, uri, index, group, onRemove }: AttachedThumbProps) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const drag = useReorderableDrag()
  return (
    <View style={styles.attachment}>
      <ImageLink
        uri={uri}
        aspect={image.width && image.height ? image.width / image.height : 1}
        group={group}
        index={index}
        corners={THUMB_RADIUS}
        onLongPress={drag}
        accessibilityLabel={t('composer.openPicture')}
      >
        <Image source={{ uri }} style={styles.thumb} contentFit="cover" transition={200} />
      </ImageLink>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('common.delete')}
        style={styles.thumbRemove}
      >
        <Icon name="close" size={13} color={ON_ACCENT} />
      </Pressable>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    dock: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end' },
    plus: { width: SIDE, height: SIDE, alignItems: 'center', justifyContent: 'center' },
    accessory: { width: '100%', alignItems: 'center' },
    floatSlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    bar: { paddingTop: BAR_PAD_TOP, paddingHorizontal: BAR_PAD_SIDE },
    floatingBar: { paddingTop: BAR_PAD_TOP, paddingHorizontal: BAR_PAD_SIDE },
    fade: { position: 'absolute', top: -28, left: 0, right: 0, bottom: 0 },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingTop: 2 },
    bannerText: { flex: 1, color: colors.textMuted, fontSize: 13 },
    bannerClose: { width: 28, height: 28 },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', maxWidth: CHAT_COLUMN, alignSelf: 'center' },
    field: { flex: 1, borderRadius: 26, padding: FIELD_PAD },
    hushed: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
    attachment: { margin: 6, marginBottom: 2, marginRight: 8 },
    thumb: { width: 72, height: 72, borderRadius: THUMB_RADIUS },
    thumbRemove: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 2,
    },
    plusAt: { position: 'absolute', left: EDGE, bottom: EDGE },
    sendAt: { position: 'absolute', right: EDGE, bottom: EDGE },
    measure: { position: 'absolute', top: 0, opacity: 0, fontSize: 17, lineHeight: 22 },
    placeholder: { position: 'absolute', right: 14, fontSize: 17, lineHeight: 22 },
    inputClip: { overflow: 'hidden' },
    inputEmpty: { height: EMPTY_INPUT_HEIGHT },
    input: {
      maxHeight: INPUT_MAX_HEIGHT,
      color: colors.text,
      fontSize: 17,
      lineHeight: 22,
      paddingTop: 0,
      paddingBottom: 8,
      paddingHorizontal: 0,
      ...(isWeb ? ({ outlineStyle: 'none', backgroundColor: 'transparent', resize: 'none' } as object) : null),
    },
    ghost: { position: 'absolute', left: 0, right: 0, top: 0, maxHeight: GHOST_MAX_HEIGHT, overflow: 'hidden' },
    ghostText: { color: colors.textMuted, fontSize: 17, lineHeight: 22 },
    tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    dockGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      height: SIDE,
      borderRadius: SIDE / 2,
      backgroundColor: colors.surfaceRaised,
      overflow: 'hidden',
      flexShrink: 1,
    },
    dockGroupActive: { backgroundColor: colors.accentSoft },
    send: { width: SIDE, height: SIDE, borderRadius: SIDE / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    sendDocked: { width: 32, height: 32, borderRadius: 16, marginRight: 4 },
    pressed: { opacity: 0.85 },
  })
