import { Icon } from '@/components/visuals/Icon'
import NativeMaskedView from '@react-native-masked-view/masked-view'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'

// The isWeb has no native mask: the package paints the mask element itself, a black slab
// over the field. There the field is shown as it is, without the fade at its edges.
const MaskedView: typeof NativeMaskedView =
  isWeb ? (({ children }: { children?: React.ReactNode }) => <>{children}</>) as never : NativeMaskedView
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { KeyboardController, KeyboardStickyView } from 'react-native-keyboard-controller'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { BlurBar, EdgeFade } from '../chrome/BarChrome'
import { GlassSurface, useGlassStyles } from '../chrome/Glass'
import { AttachSheet, loadRecentPictures } from './AttachMenu'
import { useInputColors } from '../controls/Field'
import { IconButton } from '../controls/IconButton'
import { SFIcon } from '../visuals/SFIcon'
import type { MessageImage } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { CHAT_COLUMN } from '@/hooks/util/useLayoutMode'
import { useTranslation } from '@/i18n'
import { withAlpha } from '@/lib/core/color'
import { pickMessageImages, pictureUri } from '@/lib/images/attachments'
import type { ImageSource } from '@/lib/images/images'
import * as Haptics from '@/lib/ui/haptics'
import { showToast } from '@/lib/ui/toast'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { alertError } from '@/lib/transfer/report'
import { isDesktop, isIOS, isWeb } from '@/lib/core/platform'
import { type Colors, ON_ACCENT, useColors, useStyles, useTheme } from '@/theme'
import { useRouter } from 'expo-router'
import type { Persona } from '@/db/personas'
import { finishAttachSession, setAttachAfter, setAttachSession, type AttachSession } from '@/lib/chat/attachSession'

type Props = {
  height: SharedValue<number>
  // Told where the top of the field and its accessory is (from the bottom of the screen), for
  // what floats above them in a `ComposerFloat`.
  top?: SharedValue<number>
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
  // Whether reasoning / thinking is active for this chat.
  thinking?: boolean
  onToggleThinking?: (thinking: boolean) => void
  // The persona currently bound to this chat
  persona?: Persona | null
  personaId?: number | null
  onSelectPersona?: (personaId: number | null) => void
}

export function Composer({
  height,
  top,
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
  thinking,
  onToggleThinking,
  persona,
  personaId,
  onSelectPersona,
}: Props) {
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const colors = useColors()
  const { scheme } = useTheme()
  const inputColors = useInputColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const router = useRouter()
  const db = useDatabase()
  const [text, setText] = useState(initialText)
  const textRef = useRef(text)
  textRef.current = text
  // A message being edited is not a draft.
  useEffect(() => {
    if (!editing) onTextChange?.(text)
  }, [text])
  const stash = useRef('')
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  // Which edges of the field's scrolling text have more beyond them, to fade those out
  // instead of cutting the lines off.
  const [fades, setFades] = useState({ top: false, bottom: false })
  const scrollInfo = useRef({ offset: 0, content: 0, view: 0 })
  const updateFades = () => {
    const { content, view } = scrollInfo.current
    // Text that fits does not scroll, whatever offset was left from when it was longer.
    if (content <= view + 1) scrollInfo.current.offset = 0
    const { offset } = scrollInfo.current
    const next = { top: offset > 1, bottom: content > view + 1 && offset + view < content - 1 }
    setFades((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next))
  }
  // Whether the text would not fit on one line of the narrow, one-tier field. Measured by a
  // hidden copy of the text at that width, so that widening the field cannot flip it back.
  const [wraps, setWraps] = useState(false)
  // Enter on an empty field opens the field up without typing a line break: it grows and
  // stays empty, the placeholder moving up into the new place. Ends once text has been
  // typed and cleared again (a sent message clears it too).
  const [opened, setOpened] = useState(false)
  const hadText = useRef(false)
  const picturedRef = useRef(false)
  // Whether a suggestion stands in for the empty text, which is then what gets measured.
  const suggestingRef = useRef(false)
  const change = (next: string) => {
    // With pictures attached the field is already open, so Enter is a plain line break.
    if (!textRef.current && next.includes('\n') && !next.trim() && !picturedRef.current) {
      setOpened(true)
      // The isWeb has no setNativeProps; there the controlled value already clears the field.
      inputRef.current?.setNativeProps?.({ text: '' })
      return
    }
    setText(next)
  }
  const [images, setImages] = useState<MessageImage[]>([])
  picturedRef.current = images.length > 0 && !editing
  const [picking, setPicking] = useState(false)
  const imageUris = useMemo(() => images.map(pictureUri), [images])

  // A browser scrolls whatever holds a field to show it when it takes focus. The field of a
  // swap starts below its place, so autoFocus there pushed the whole interface down.
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

  // An empty text may not be laid out again, so it ends the wrapped state itself.
  useEffect(() => {
    if (text) hadText.current = true
    else {
      if (!suggestingRef.current) setWraps(false)
      if (hadText.current) {
        hadText.current = false
        setOpened(false)
      }
    }
  }, [text])

  const value = text.trim()
  const suggesting = !editing && !value && !images.length && !!suggestion
  suggestingRef.current = suggesting
  // The suggestion ending (taken, dismissed, a new message) lets the wrapped state go.
  useEffect(() => {
    if (!suggesting && !textRef.current) setWraps(false)
  }, [suggesting])
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
      alertError(t('composer.attachFailedTitle'), err)
    } finally {
      setPicking(false)
    }
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
          size={mode === 'stop' ? 13 : 17}
          color={mode === 'idle' ? colors.textFaint : mode === 'continue' ? colors.text : ON_ACCENT}
          effect={{ effect: 'bounce' }}
          trigger={mode === 'idle' ? 'send' : mode}
          onAccent={mode === 'send' || mode === 'save' || mode === 'stop'}
        />
      </Animated.View>
    </Pressable>
  )

  // With a toolbar the field has two tiers: the text across the
  // whole width, and under it the toolbar on the left and the send button on the right.
  const docked = toolbar !== undefined && toolbar !== null && !editing
  // As in ChatGPT: one line is a capsule with the plus and the send button at the sides;
  // a second line (typed or wrapped) moves them under the text, which takes the full width.
  const pictured = images.length > 0 && !editing
  const [imagesH, setImagesH] = useState(0)
  const expanded = docked || opened || pictured || wraps || text.includes('\n') || (suggesting && !!suggestion?.includes('\n'))
  const inputPad = expanded
    ? styles.inputExpanded
    : { paddingLeft: editing ? 14 : SIDE_PAD, paddingRight: SIDE_PAD }

  // The attach menu: the system sheet on iOS (app/attach), the app's own bottom sheet elsewhere.
  const [menuShown, setMenuShown] = useState(false)
  const [session, setSession] = useState<AttachSession | null>(null)
  // Whether the keyboard was up when the menu opened, so it comes back once the menu is closed.
  const restoreKeyboardOnClose = useRef(false)

  const openMenu = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const isKeyboardUp = KeyboardController.isVisible() || focused || !!inputRef.current?.isFocused?.()
    restoreKeyboardOnClose.current = isKeyboardUp

    if (isKeyboardUp) {
      inputRef.current?.blur?.()
      await KeyboardController.dismiss({ animated: true })
    }

    const next: AttachSession = {
      opened: Date.now(),
      recents: await loadRecentPictures(db),
      thinking,
      onToggleThinking,
      persona,
      personaId,
      onSelectPersona,
      // A picture picked from the menu leaves the keyboard down, as the picker left it.
      onPick: (source) => {
        restoreKeyboardOnClose.current = false
        setTimeout(() => attach(source), 50)
      },
      onAttach: (pictures) =>
        setImages((current) => {
          const existing = new Set(current.map((p) => p.file))
          return [...current, ...pictures.filter((p) => !existing.has(p.file))]
        }),
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

  // Only the app's own sheet: the system one is closed by the router.
  const closeMenu = (then?: () => void) => {
    setAttachAfter(then ?? null)
    setMenuShown(false)
  }

  // A resting one-line field is a little narrower than with the keyboard up.
  const narrow = useSharedValue(0)
  const resting = !focused && !expanded
  useEffect(() => {
    narrow.value = withTiming(resting ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) })
  }, [resting, narrow])
  const narrowStyle = useAnimatedStyle(() => ({ paddingHorizontal: narrow.value * NARROW_INSET }))

  // The placeholder and the suggestion sit where the text will start: at once in the opened
  // field, no gliding between the two layouts.
  const textLeft = expanded ? 14 : editing ? 14 : SIDE_PAD
  const textRight = expanded ? 14 : SIDE_PAD
  const textTop = docked ? 12 : expanded ? 10 : 8
  const showPlaceholder = !text && !suggesting
  // The row sits in the bar's padding and the field is narrowed by the inset on each side.
  const sidePad = Math.max(BAR_PAD_SIDE, Math.max(insets.left, insets.right))
  const measureWidth = Math.max(
    0,
    Math.min(windowWidth - insets.left - insets.right, CHAT_COLUMN + 2 * sidePad) - 2 * (sidePad + NARROW_INSET) - (FIELD_PAD + (editing ? 14 : SIDE_PAD)) - (FIELD_PAD + SIDE_PAD)
  )

  const plus = editing ? null : (
    <Pressable
      onPress={() => (menuShown ? closeMenu() : openMenu())}
      disabled={picking}
      hitSlop={4}
      accessibilityLabel={t('attach.title')}
      style={[styles.plus, picking && { opacity: 0.55 }]}
    >
      <Icon name="add" size={24} color={colors.text} />
    </Pressable>
  )

  const barExtra = BAR_PAD_TOP + BAR_PAD_BOTTOM + insets.bottom

  // The box follows the height of its content, easing to it: a line added or removed, or
  // the buttons dropping under the text, grows or shrinks the field instead of snapping it.
  const boxHeight = useSharedValue(SIDE + 2 * FIELD_PAD + 4)
  const fitted = useRef(false)
  const fit = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    // The list keeps the room of the field as it was with no text: a field growing with the
    // text goes over the messages instead of pushing them. (It cannot be told from wrapped
    // text by the flags alone, since the layout comes before they update.) A toolbar's
    // field counts as it is when empty, too.
    if (fitted.current) boxHeight.value = withTiming(h, { duration: 220, easing: Easing.out(Easing.cubic) })
    else boxHeight.value = h
    fitted.current = true
  }
  // What the list reserves is the baseline floor as it is with one line, worked out from
  // the parts that do not depend on the text or dynamic attachments. Attachments and multiline
  // text expand boxHeight smoothly; keeping dynamic media heights out of reserve ensures
  // the list extra padding eases smoothly via withTiming instead of jumping instantly.
  const [bannerH, setBannerH] = useState(0)
  const [toolsH, setToolsH] = useState(0)
  const reserve =
    2 * FIELD_PAD +
    (editing ? bannerH : 0) +
    (docked ? DOCKED_INPUT + toolsH : ONE_LINE_INPUT) +
    barExtra
  // The list reserves the room the field really takes, so a taller one (a few lines, a
  // suggestion, pictures) pushes the messages up instead of covering the last lines and their
  // actions. It eases with the box, and never goes below the room of the one-line field.
  useAnimatedReaction(
    () => Math.max(reserve, barExtra + boxHeight.value),
    (value) => {
      height.value = value
    },
    [reserve, barExtra]
  )

  // The accessory sits on the height the list reserves, not on the bar itself, so it does not
  // follow every line the field gains.
  // It rises when the field is taller than that (an opened field, one with pictures), so
  // the field never covers it.
  const accessoryStyle = useAnimatedStyle(() => ({ bottom: Math.max(height.value, barExtra + boxHeight.value) }))
  const accessoryH = useSharedValue(0)
  useAnimatedReaction(
    () => Math.max(height.value, barExtra + boxHeight.value) + accessoryH.value,
    (value) => {
      if (top) top.value = value
    },
    [barExtra, top]
  )
  const boxStyle = useAnimatedStyle(() => ({ height: boxHeight.value }))

  // The fades only exist in the opened field: in the one-line capsule nothing scrolls, and a
  // size or offset left over from the taller field must not keep an edge dimmed. An emptied
  // field has scrolled back to the top.
  const edges = expanded ? fades : NO_FADES
  useEffect(() => {
    if (expanded && text) return
    scrollInfo.current.offset = 0
    scrollInfo.current.content = 0
    setFades((prev) => (prev.top || prev.bottom ? NO_FADES : prev))
  }, [expanded, text])

  const row = (
    <Animated.View style={[styles.row, narrowStyle]}>
      <Animated.View style={[styles.fieldBox, boxStyle]} collapsable={false}>
        {/* The glass is a sibling of the content, so the box can grow under the text. */}
        <GlassSurface style={[StyleSheet.absoluteFill, styles.glass, hushed && styles.hushed]} fallbackStyle={glass.solid} />
        <View style={styles.field} onLayout={fit}>
        {editing ? (
          <View style={styles.banner} onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}>
            <Icon name="create-outline" size={15} color={colors.accent} />
            <Text style={styles.bannerText}>{t('chat.editingMessage')}</Text>
            <IconButton name="close" size={18} color={colors.textMuted} onPress={onCancelEdit} style={styles.bannerClose} />
          </View>
        ) : null}
        {images.length && !editing ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onLayout={(e) => setImagesH(e.nativeEvent.layout.height)}
          >
            {imageUris.map((uri, index) => (
              <View key={index} style={styles.attachment}>
                <Image source={{ uri }} style={styles.thumb} contentFit="cover" transition={200} />
                <Pressable
                  onPress={() => setImages((current) => current.filter((_, i) => i !== index))}
                  hitSlop={8}
                  style={styles.thumbRemove}
                >
                  <Icon name="close" size={13} color={ON_ACCENT} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <GestureDetector gesture={swipe}>
          <View>
            <MaskedView
              maskElement={
                <View style={styles.maskFill}>
                  <LinearGradient colors={edges.top ? [CLEAR, SOLID] : [SOLID, SOLID]} style={styles.maskEdge} />
                  <View style={styles.maskMiddle} />
                  <LinearGradient colors={edges.bottom ? [SOLID, CLEAR] : [SOLID, SOLID]} style={styles.maskEdge} />
                </View>
              }
            >
              <TextInput
                key={inputKey}
                ref={inputRef}
                value={text}
                onChangeText={change}
                onScroll={(e) => {
                  scrollInfo.current.offset = e.nativeEvent.contentOffset.y
                  updateFades()
                }}
                onContentSizeChange={(e) => {
                  scrollInfo.current.content = e.nativeEvent.contentSize.height
                  updateFades()
                }}
                onLayout={(e) => {
                  scrollInfo.current.view = e.nativeEvent.layout.height
                  updateFades()
                }}
                // Backspace in the opened, empty field folds it back.
                onKeyPress={(e) => {
                  if (e.nativeEvent.key === 'Backspace' && !textRef.current) setOpened(false)
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={suggesting ? '' : (placeholder ?? t('chat.messagePlaceholder'))}
                {...inputColors}
                // The placeholder is drawn below, where it can glide between the two layouts.
                placeholderTextColor="transparent"
                multiline
                // A browser's <textarea> is two rows tall unless told otherwise. On iOS the prop
                // is a cap on the lines the field shows, so it is left off there.
                numberOfLines={isWeb ? 1 : undefined}
                autoFocus={autoFocus && !isWeb}
                accessibilityHint={suggesting ? t('chat.suggestionHint') : undefined}
                style={[
                  styles.input,
                  inputPad,
                  docked && styles.inputDocked,
                  suggesting && { minHeight: ghostHeight + (docked ? 12 : expanded ? 10 : 8) + 8 },
                ]}
              />
            </MaskedView>
            {suggesting ? (
              <Animated.View
                style={[styles.ghost, { left: textLeft, top: textTop, right: textRight }]}
                pointerEvents="none"
              >
                <Text style={styles.ghostText} onLayout={(e) => setGhostHeight(e.nativeEvent.layout.height)}>
                  {suggestion}
                </Text>
              </Animated.View>
            ) : null}
            {showPlaceholder ? (
              <Animated.Text
                style={[
                  styles.placeholder,
                  { left: textLeft, top: textTop, right: textRight, color: inputColors.placeholderTextColor },
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
          <View style={styles.tools} onLayout={(e) => setToolsH(e.nativeEvent.layout.height)}>
            {plus}
            <View style={styles.toolbar}>{toolbar}</View>
            {sendButton}
          </View>
        ) : (
          <>
            {expanded ? <View style={{ height: SIDE + 2 }} /> : null}
            <View style={styles.plusAt} pointerEvents="box-none">
              {plus}
            </View>
            <View style={styles.sendAt} pointerEvents="box-none">
              {sendButton}
            </View>
            <Text
              style={[
                styles.measure,
                // A fixed width, that of the field at rest (the narrowest it gets), worked out
                // from the screen. Taken from the field itself it changed with the focus and
                // along the 220 ms the field takes to narrow, so a line that fit in one and
                // not in the other opened the field, which widened, folded back, and so on.
                { left: FIELD_PAD + (editing ? 14 : SIDE_PAD), width: measureWidth },
              ]}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onTextLayout={(e) => setWraps(e.nativeEvent.lines.length > 1)}
            >
              {text || (suggesting ? suggestion : '')}
            </Text>
          </>
        )}
        </View>
      </Animated.View>
    </Animated.View>
  )

  return (
    // The accessory sits in the dock's own layout: iOS ignores touches on children drawn
    // outside their parent, and box-none lets touches around it reach the list.
    <KeyboardStickyView
      // The dock always covers the screen (touches pass through it, except on the menu's
      // backdrop), so showing the menu changes no layout and a tap outside can close it.
      style={styles.dock}
      offset={{ closed: 0, opened: insets.bottom }}
      pointerEvents="box-none"
    >
      <Animated.View
        collapsable={false}
        style={[styles.accessory, accessoryStyle]}
        pointerEvents="box-none"
        onLayout={(e) => {
          accessoryH.value = e.nativeEvent.layout.height
        }}
      >
        {accessory}
      </Animated.View>
      {isWeb ? (
        // The desktop field floats over the messages with nothing under it.
        <View
          style={[
            styles.floatingBar,
            {
              paddingBottom: insets.bottom + BAR_PAD_BOTTOM,
              paddingLeft: Math.max(BAR_PAD_SIDE, insets.left + 4),
              paddingRight: Math.max(BAR_PAD_SIDE, insets.right + 4),
            },
          ]}
          pointerEvents="box-none"
        >
          {row}
        </View>
      ) : liquidGlass ? (
        // Glass controls float over the messages; the fade keeps text scrolling
        // underneath from clashing with them.
        <View
          style={[
            styles.floatingBar,
            {
              paddingBottom: insets.bottom + BAR_PAD_BOTTOM,
              paddingLeft: Math.max(BAR_PAD_SIDE, insets.left + 4),
              paddingRight: Math.max(BAR_PAD_SIDE, insets.right + 4),
            },
          ]}
          pointerEvents="box-none"
        >
          <EdgeFade edge="bottom" style={styles.fade} />
          {row}
        </View>
      ) : (
        <BlurBar
          edge="bottom"
          style={[
            styles.bar,
            {
              paddingBottom: insets.bottom + BAR_PAD_BOTTOM,
              paddingLeft: Math.max(BAR_PAD_SIDE, insets.left + 4),
              paddingRight: Math.max(BAR_PAD_SIDE, insets.right + 4),
            },
          ]}
        >
          {row}
        </BlurBar>
      )}
      {!isIOS ? <AttachSheet visible={menuShown} session={session} onClose={closeMenu} onDismissed={() => finishAttachSession()} /> : null}
    </KeyboardStickyView>
  )
}

// Floats above the composer and whatever it carries, and stays when the composer is swapped
// (the jump button in a chat). `top` is the one given to the `Composer`.
export function ComposerFloat({ top, children }: { top: SharedValue<number>; children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const styles = useStyles(createStyles)
  const style = useAnimatedStyle(() => ({ bottom: withTiming(top.value, { duration: 180, easing: Easing.out(Easing.cubic) }) }))
  return (
    <KeyboardStickyView style={styles.dock} offset={{ closed: 0, opened: insets.bottom }} pointerEvents="box-none">
      <Animated.View style={[styles.accessory, style]} pointerEvents="box-none">
        {children}
      </Animated.View>
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
  // On a desktop window the screen is far too tall for that: the field only dips a little
  // and fades, which reads as a swap instead of a flight across the window.
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

  // Opacity only on the web: there is no Liquid Glass there to lose its material.
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

// Keeps the composer and its attach menu above `ComposerFloat` (which houses the jump button).
const swapStyle = { zIndex: 1 }

// The plus and the send button are SIDE wide; the text of a one-line field keeps clear of
// them by SIDE_PAD. NARROW_INSET is how much narrower the field is at rest.
const SIDE = 34
// The mask that fades the scrolling text out at its edges (only the alpha counts).
const SOLID = '#000000'
const CLEAR = 'rgba(0,0,0,0)'
const FADE = 18
const NO_FADES = { top: false, bottom: false }
// The input's own height with a single line: padding 8 + a 22 line + 8 (docked: 12 on top).
const ONE_LINE_INPUT = 38
const DOCKED_INPUT = 42
// The bar's padding around the field (the bottom one comes on top of the safe area).
const BAR_PAD_TOP = 8
const BAR_PAD_BOTTOM = 8
const BAR_PAD_SIDE = 10
// The recent pictures of the attach menu: one row that scrolls sideways.

// Absolute children are placed from the field's outer edge, not inside its padding.
const EDGE = 7
const FIELD_PAD = 5
const SIDE_PAD = EDGE + SIDE + 8 - FIELD_PAD
const NARROW_INSET = 16

const ICONS = {
  idle: { sf: 'arrow.up', fallback: 'arrow-up' },
  send: { sf: 'arrow.up', fallback: 'arrow-up' },
  save: { sf: 'checkmark', fallback: 'checkmark' },
  stop: { sf: 'stop.fill', fallback: 'stop' },
  continue: { sf: 'forward.fill', fallback: 'play-forward' },
} as const


const createStyles = (colors: Colors) =>
  StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end' },
  plus: { width: SIDE, height: SIDE, alignItems: 'center', justifyContent: 'center' },
  accessory: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: { paddingTop: BAR_PAD_TOP, paddingHorizontal: BAR_PAD_SIDE },
  floatingBar: { paddingTop: BAR_PAD_TOP, paddingHorizontal: BAR_PAD_SIDE },
  fade: { position: 'absolute', top: -28, left: 0, right: 0, bottom: 0 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingTop: 2 },
  bannerText: { flex: 1, color: colors.textMuted, fontSize: 13 },
  bannerClose: { width: 28, height: 28 },
  // Matches MessageRow's cap so the composer lines up with the message column; a no-op
  // on phone widths.
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', maxWidth: CHAT_COLUMN, alignSelf: 'center' },
  // Clipped to the glass's own corners: a square clip let what the field draws (the
  // suggestion's taller input) show as dark corners outside the rounded glass.
  fieldBox: { flex: 1, overflow: 'hidden', borderRadius: 26 },
  glass: { borderRadius: 26 },
  // Pinned to the bottom, so a taller field reveals its text from above while the buttons stay.
  field: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: FIELD_PAD },
  hushed: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  attachment: { margin: 6, marginBottom: 2, marginRight: 8 },
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
    borderWidth: isDesktop ? 0 : 1,
    borderColor: colors.border,
  },
  plusAt: { position: 'absolute', left: EDGE, bottom: EDGE },
  sendAt: { position: 'absolute', right: EDGE, bottom: EDGE },
  // Never seen: the text laid out at the one-line width, to count its lines.
  placeholder: { position: 'absolute', fontSize: 17, lineHeight: 22 },
  maskFill: { flex: 1, backgroundColor: 'transparent' },
  maskEdge: { height: FADE },
  maskMiddle: { flex: 1, backgroundColor: SOLID },
  measure: { position: 'absolute', top: 0, opacity: 0, fontSize: 17, lineHeight: 22 },
  inputExpanded: { paddingHorizontal: 14, paddingTop: 10 },
  input: {
    maxHeight: 180,
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 14,
    // The browser's own focus ring and white fill would show through the glass fallback.
    ...(isWeb ? ({ outlineStyle: 'none', backgroundColor: 'transparent', resize: 'none' } as object) : null),
  },
  ghost: { position: 'absolute', maxHeight: 164, overflow: 'hidden' },
  ghostText: { color: colors.textMuted, fontSize: 17, lineHeight: 22 },
  inputDocked: { paddingTop: 12, paddingBottom: 8 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolbar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  send: { width: SIDE, height: SIDE, borderRadius: SIDE / 2, alignItems: 'center', justifyContent: 'center' },
})
