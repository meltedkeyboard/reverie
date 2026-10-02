import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { KeyboardStickyView } from 'react-native-keyboard-controller'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { AttachButton } from './AttachButton'
import { BlurBar, EdgeFade } from './BarChrome'
import { GlassSurface, useGlassStyles } from './Glass'
import { useInputColors } from './Field'
import { IconButton } from './IconButton'
import { SFIcon } from './SFIcon'
import type { MessageImage } from '@/db/messages'
import { useTranslation } from '@/i18n'
import { showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import { attachmentUri, pickMessageImages } from '@/lib/attachments'
import type { ImageSource } from '@/lib/images'
import * as Haptics from '@/lib/haptics'
import { liquidGlass } from '@/lib/nativeUI'
import { useColors, useStyles, type Colors } from '@/theme'

type Props = {
  height: SharedValue<number>
  generating: boolean
  editing: { id: number; text: string } | null
  // Floats centered above the bar and follows it with the keyboard.
  accessory?: React.ReactNode
  onSend: (text: string, images: MessageImage[]) => void
  onStop: () => void
  // Lets the model take the next turn when nothing is typed; absent when it has nothing to go on.
  onContinue?: () => void
  onSubmitEdit: (text: string) => void
  onCancelEdit: () => void
  // Drawn inside the field under the text, next to the send button, e.g. who a room's
  // message goes to.
  toolbar?: React.ReactNode
  placeholder?: string
  // A long press on the continue button, for a choice of how far to go on.
  onContinueLongPress?: () => void
  // Marks the field as a whisper.
  hushed?: boolean
  // What the field starts with and where its text goes, so a draft outlives the field
  // being swapped for another one.
  initialText?: string
  onTextChange?: (text: string) => void
  autoFocus?: boolean
  // A guess at the next message, shown in place of the placeholder while the field is
  // empty. A swipe to the right across the field types it in.
  suggestion?: string | null
  onSuggestionTaken?: () => void
  // A swipe to the left turns the suggestion down.
  onSuggestionDismissed?: () => void
}

export function Composer({
  height,
  generating,
  editing,
  accessory,
  onSend,
  onStop,
  onContinue,
  onSubmitEdit,
  onCancelEdit,
  toolbar,
  placeholder,
  initialText = '',
  onTextChange,
  autoFocus = false,
  onContinueLongPress,
  hushed = false,
  suggestion,
  onSuggestionTaken,
  onSuggestionDismissed,
}: Props) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const inputColors = useInputColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [text, setText] = useState(initialText)
  const textRef = useRef(text)
  textRef.current = text
  // A message being edited is not a draft.
  useEffect(() => {
    if (!editing) onTextChange?.(text)
  }, [text])
  const stash = useRef('')
  const inputRef = useRef<TextInput>(null)
  const [images, setImages] = useState<MessageImage[]>([])
  const [picking, setPicking] = useState(false)
  const imageUris = useMemo(() => images.map((image) => attachmentUri(image.file)), [images])

  useEffect(() => {
    if (!editing) return
    stash.current = textRef.current
    setText(editing.text)
    inputRef.current?.focus()
    return () => setText(stash.current)
  }, [editing?.id])

  const value = text.trim()
  const suggesting = !editing && !value && !images.length && !!suggestion
  // Height of the suggestion as drawn over the field. It is not the placeholder: on iOS a
  // multiline field grows to fit a long placeholder and never shrinks back after it.
  const [ghostHeight, setGhostHeight] = useState(0)
  // A long text put into the field from code leaves a multiline field on iOS at that
  // height after it is cleared. The field is made anew after such a message is sent.
  const [inputKey, setInputKey] = useState(0)
  const inserted = useRef(false)
  useEffect(() => {
    if (inputKey) inputRef.current?.focus()
  }, [inputKey])

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
  // Stays out of the way of taps, which focus the field, and of vertical scrolling.
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .enabled(suggesting)
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (e.translationX > 48) takeSuggestion()
      else if (e.translationX < -48) dismissSuggestion()
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

  const armed = useSharedValue(0)
  useEffect(() => {
    // Continuing is a secondary action, so the button stays gray instead of turning accent.
    armed.value = withTiming(mode === 'idle' || mode === 'continue' ? 0 : 1, { duration: 160 })
  }, [mode, armed])

  const buttonStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(armed.value, [0, 1], [colors.surfaceRaised, colors.accent]),
    transform: [{ scale: 0.92 + armed.value * 0.08 }],
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
        // A typed multi-line message leaves the field tall when only the state is cleared;
        // the native clear() makes it measure again and keeps the keyboard and the focus.
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
      showMessage(t('composer.attachFailedTitle'), errorMessage(err))
    } finally {
      setPicking(false)
    }
  }

  const measure = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height
  }

  const sendButton = (
    <Pressable
      onPress={onPress}
      onLongPress={mode === 'continue' ? onContinueLongPress : undefined}
      disabled={mode === 'idle'}
      hitSlop={6}
      accessibilityLabel={mode === 'continue' ? t('chat.continueAccessibility') : undefined}
    >
      <Animated.View style={[styles.send, buttonStyle]}>
        {/* The symbol bounces when the button changes its meaning (send, stop, save),
            but not when it merely lights up as the user starts typing. */}
        <SFIcon
          name={ICONS[mode].sf}
          fallback={ICONS[mode].fallback}
          size={mode === 'stop' ? 14 : 18}
          color={mode === 'idle' ? colors.textFaint : mode === 'continue' ? colors.text : '#FFFFFF'}
          effect={{ effect: 'bounce' }}
          trigger={mode === 'idle' ? 'send' : mode}
          onAccent={mode === 'send' || mode === 'save' || mode === 'stop'}
        />
      </Animated.View>
    </Pressable>
  )

  // With a toolbar the field has two tiers, as in the Claude app: the text across the
  // whole width, and under it the toolbar on the left and the send button on the right.
  const docked = toolbar !== undefined && toolbar !== null && !editing

  const row = (
    <View style={styles.row}>
      {editing ? null : <AttachButton size={FIELD_HEIGHT} disabled={picking} onPick={attach} />}
      <GlassSurface style={[styles.field, hushed && styles.hushed]} fallbackStyle={glass.solid}>
        {editing ? (
          <View style={styles.banner}>
            <Ionicons name="create-outline" size={15} color={colors.accent} />
            <Text style={styles.bannerText}>{t('chat.editingMessage')}</Text>
            <IconButton name="close" size={18} color={colors.textMuted} onPress={onCancelEdit} style={styles.bannerClose} />
          </View>
        ) : null}
        {images.length && !editing ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {imageUris.map((uri, index) => (
              <View key={index} style={styles.attachment}>
                <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
                <Pressable
                  onPress={() => setImages((current) => current.filter((_, i) => i !== index))}
                  hitSlop={8}
                  style={styles.thumbRemove}
                >
                  <Ionicons name="close" size={13} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <View style={docked ? undefined : styles.inputRow}>
          <GestureDetector gesture={swipe}>
            <View style={docked ? undefined : styles.inputWrap}>
              <TextInput
                key={inputKey}
                ref={inputRef}
                value={text}
                onChangeText={setText}
                placeholder={suggesting ? '' : (placeholder ?? t('chat.messagePlaceholder'))}
                {...inputColors}
                multiline
                autoFocus={autoFocus}
                accessibilityHint={suggesting ? t('chat.suggestionHint') : undefined}
                style={[
                  styles.input,
                  docked && styles.inputDocked,
                  suggesting && { minHeight: ghostHeight },
                ]}
              />
              {suggesting ? (
                <View style={styles.ghost} pointerEvents="none" onLayout={(e) => setGhostHeight(e.nativeEvent.layout.height)}>
                  <Text style={[styles.ghostText, docked && styles.inputDocked]}>{suggestion}</Text>
                </View>
              ) : null}
            </View>
          </GestureDetector>
          {docked ? (
            <View style={styles.tools}>
              <View style={styles.toolbar}>{toolbar}</View>
              {sendButton}
            </View>
          ) : (
            sendButton
          )}
        </View>
      </GlassSurface>
    </View>
  )

  return (
    // The accessory sits in the dock's own layout: iOS ignores touches on children drawn
    // outside their parent, and box-none lets touches around it reach the list.
    <KeyboardStickyView style={styles.dock} offset={{ closed: 0, opened: insets.bottom }} pointerEvents="box-none">
      <View style={styles.accessory} pointerEvents="box-none">
        {accessory}
      </View>
      {liquidGlass ? (
        // Glass controls float over the messages; the fade keeps text scrolling
        // underneath from clashing with them.
        <View style={[styles.floatingBar, { paddingBottom: insets.bottom + 8 }]} onLayout={measure} pointerEvents="box-none">
          <EdgeFade edge="bottom" style={styles.fade} />
          {row}
        </View>
      ) : (
        <BlurBar edge="bottom" style={[styles.bar, { paddingBottom: insets.bottom + 8 }]} onLayout={measure}>
          {row}
        </BlurBar>
      )}
    </KeyboardStickyView>
  )
}

// Holds the composer and swaps it for another when `id` changes, as between the chat's
// field and the one that asks the model aside: the old one sinks out of sight with all it
// carries, and only then is it replaced and the new one springs up. Only a transform,
// since Liquid Glass renders wrongly under a fading parent.
export function ComposerSwap({ id, children }: { id: string; children: React.ReactNode }) {
  const { height: screenHeight } = useWindowDimensions()
  const [shownId, setShownId] = useState(id)
  // The old field keeps its last props while it leaves.
  const shown = useRef(children)
  if (id === shownId) shown.current = children
  const offset = useSharedValue(0)
  // Far enough to clear the screen even with the keyboard up and a panel over the field.
  const distance = screenHeight * 0.6

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

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))
  return (
    <Animated.View key={shownId} style={[StyleSheet.absoluteFill, style]} pointerEvents="box-none">
      {shown.current}
    </Animated.View>
  )
}

// A one-line field: the send button and the field's padding around it. The attach
// button beside it is as tall, so the two line up.
const FIELD_HEIGHT = 48

const ICONS = {
  idle: { sf: 'arrow.up', fallback: 'arrow-up' },
  send: { sf: 'arrow.up', fallback: 'arrow-up' },
  save: { sf: 'checkmark', fallback: 'checkmark' },
  stop: { sf: 'stop.fill', fallback: 'stop' },
  continue: { sf: 'forward.fill', fallback: 'play-forward' },
} as const

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  accessory: { alignItems: 'center' },
  bar: { paddingTop: 8, paddingHorizontal: 10 },
  floatingBar: { paddingTop: 8, paddingHorizontal: 10 },
  fade: { position: 'absolute', top: -28, left: 0, right: 0, bottom: 0 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingTop: 2 },
  bannerText: { flex: 1, color: colors.textMuted, fontSize: 13 },
  bannerClose: { width: 28, height: 28 },
  // Matches MessageRow's cap so the composer lines up with the message column; a no-op
  // on phone widths.
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', alignSelf: 'center' },
  field: { flex: 1, borderRadius: 26, padding: 5 },
  hushed: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  attachment: { margin: 6, marginBottom: 2, marginRight: 4 },
  thumb: { width: 72, height: 72, borderRadius: 14 },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  inputWrap: { flex: 1 },
  input: {
    flex: 1,
    maxHeight: 180,
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 14,
  },
  ghost: { position: 'absolute', top: 0, left: 0, right: 0, maxHeight: 180, overflow: 'hidden' },
  ghostText: { color: colors.textMuted, fontSize: 17, lineHeight: 22, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 14 },
  inputDocked: { paddingTop: 12, paddingBottom: 8 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolbar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
})
