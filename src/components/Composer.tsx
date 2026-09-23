import Ionicons from '@expo/vector-icons/Ionicons'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native'
import { KeyboardStickyView } from 'react-native-keyboard-controller'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AttachButton, type AttachSource } from './AttachButton'
import { GlassSurface } from './Glass'
import { IconButton } from './IconButton'
import { SFIcon } from './SFIcon'
import type { MessageImage } from '@/db/messages'
import { useTranslation } from '@/i18n'
import { showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import { imageDataUrl, pickMessageImage } from '@/lib/images'
import { liquidGlass } from '@/lib/nativeUI'
import { CHAT_MAX_WIDTH, useStyles, useTheme, type Colors } from '@/theme'

type Props = {
  height: SharedValue<number>
  generating: boolean
  editing: { id: number; text: string } | null
  // Floats centered above the bar and follows it with the keyboard.
  accessory?: React.ReactNode
  onSend: (text: string, image: MessageImage | null) => void
  onStop: () => void
  // Lets the model take the next turn when nothing is typed; absent when it has nothing to go on.
  onContinue?: () => void
  onSubmitEdit: (text: string) => void
  onCancelEdit: () => void
  // Plain (non-worklet) mirror of `height`, for callers that need to react to it outside
  // reanimated — e.g. reserving list space on web, where extraContentPadding isn't wired up.
  onHeightChange?: (height: number) => void
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
  onHeightChange,
}: Props) {
  const insets = useSafeAreaInsets()
  const { colors, scheme } = useTheme()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const textRef = useRef(text)
  textRef.current = text
  const stash = useRef('')
  const inputRef = useRef<TextInput>(null)
  const [image, setImage] = useState<MessageImage | null>(null)
  const [picking, setPicking] = useState(false)
  const imageUri = useMemo(() => (image ? imageDataUrl(image.base64) : null), [image])

  useEffect(() => {
    if (!editing) return
    stash.current = textRef.current
    setText(editing.text)
    inputRef.current?.focus()
    return () => setText(stash.current)
  }, [editing?.id])

  const value = text.trim()
  const mode = editing
    ? value
      ? 'save'
      : 'idle'
    : generating
      ? 'stop'
      : value || image
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
      onSend(value, image)
      setText('')
      setImage(null)
    }
  }

  const attach = async (source: AttachSource) => {
    setPicking(true)
    try {
      const picked = await pickMessageImage(source)
      if (picked) setImage(picked)
    } catch (err) {
      showMessage(t('composer.attachFailedTitle'), errorMessage(err))
    } finally {
      setPicking(false)
    }
  }

  // A desktop keyboard has no send button, so Enter sends and Shift+Enter breaks
  // the line. On a phone Enter keeps inserting a newline as before.
  const onKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = event.nativeEvent as unknown as KeyboardEvent
    if (key.key !== 'Enter' || key.shiftKey || key.isComposing) return
    event.preventDefault()
    if (mode === 'send' || mode === 'save') onPress()
  }

  const measure = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height
    onHeightChange?.(e.nativeEvent.layout.height)
  }

  const row = (
    <View style={styles.row}>
      {editing ? null : <AttachButton disabled={picking} onPick={attach} />}
      <GlassSurface style={styles.field} fallbackStyle={styles.fieldSolid}>
        {editing ? (
          <View style={styles.banner}>
            <Ionicons name="create-outline" size={15} color={colors.accent} />
            <Text style={styles.bannerText}>{t('chat.editingMessage')}</Text>
            <IconButton name="close" size={18} color={colors.textMuted} onPress={onCancelEdit} style={styles.bannerClose} />
          </View>
        ) : null}
        {imageUri && !editing ? (
          <View style={styles.attachment}>
            <Image source={{ uri: imageUri }} style={styles.thumb} contentFit="cover" />
            <Pressable onPress={() => setImage(null)} hitSlop={8} style={styles.thumbRemove}>
              <Ionicons name="close" size={13} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onKeyPress={Platform.OS === 'web' ? onKeyPress : undefined}
            placeholder={t('chat.messagePlaceholder')}
            placeholderTextColor={colors.textFaint}
            multiline
            keyboardAppearance={scheme}
            selectionColor={colors.accent}
            style={styles.input}
          />
          <Pressable
            onPress={onPress}
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
                size={mode === 'stop' ? 13 : 16}
                color={mode === 'idle' ? colors.textFaint : mode === 'continue' ? colors.text : '#FFFFFF'}
                effect={{ effect: 'bounce' }}
                trigger={mode === 'idle' ? 'send' : mode}
              />
            </Animated.View>
          </Pressable>
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
          <LinearGradient
            colors={[`rgba(${colors.bgRgb}, 0)`, `rgba(${colors.bgRgb}, 0.85)`, colors.bg]}
            locations={[0, 0.45, 1]}
            style={styles.fade}
            pointerEvents="none"
          />
          {row}
        </View>
      ) : (
        <BlurView tint={scheme} intensity={55} style={[styles.bar, { paddingBottom: insets.bottom + 8 }]} onLayout={measure}>
          {row}
        </BlurView>
      )}
    </KeyboardStickyView>
  )
}

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
  bar: {
    paddingTop: 8,
    paddingHorizontal: 10,
    backgroundColor: `rgba(${colors.bgRgb}, 0.55)`,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  floatingBar: { paddingTop: 8, paddingHorizontal: 10 },
  fade: { position: 'absolute', top: -28, left: 0, right: 0, bottom: 0 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingTop: 2 },
  bannerText: { flex: 1, color: colors.textMuted, fontSize: 13 },
  bannerClose: { width: 28, height: 28 },
  // Matches MessageRow's cap so the composer lines up with the message column; a no-op
  // on phone widths.
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', maxWidth: CHAT_MAX_WIDTH, alignSelf: 'center' },
  field: { flex: 1, borderRadius: 22, padding: 4 },
  fieldSolid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  attachment: { alignSelf: 'flex-start', margin: 6, marginBottom: 2 },
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
  input: {
    flex: 1,
    maxHeight: 132,
    color: colors.text,
    fontSize: 16,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
})
