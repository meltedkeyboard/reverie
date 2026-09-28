import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Animated, {
  useAnimatedStyle,
  withSpring,
  type EntryExitAnimationFunction,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { ChatPhase } from '@/hooks/useChat'
import { useTranslation } from '@/i18n'
import type { AsideQuestion, AsideTurn } from '@/lib/aside'
import { imageDataUrl } from '@/lib/images'
import type { ReplyFrame } from '@/lib/replyStream'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

import { ErrorCard } from './ConversationList'
import { GlassSurface } from './Glass'
import { useHeaderHeight } from './GlassHeader'
import { ImageLink } from './ImageLink'
import { ThoughtBlock } from './MessageRow'
import { TypingIndicator } from './TypingIndicator'

type Props = {
  turns: AsideTurn[]
  pending: AsideQuestion | null
  draft: ReplyFrame | null
  phase: ChatPhase
  error: string | null
  // Height of the composer under the panel, to leave it the room above.
  composerHeight: SharedValue<number>
  onRetry: () => void
  onClose: () => void
  // A long press on an answer, to select and copy from it.
  onSelectText: (text: string) => void
}

const LONG_PRESS_MS = 350

// Rises with its field as one piece (see ComposerSwap) and on the way unfolds from the
// field's edge, growing from its bottom with a little overshoot. Only transforms, since
// Liquid Glass renders wrongly under a fading parent.
const POP = { damping: 15, stiffness: 240, mass: 0.9 }
const unfold: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { transform: [{ translateY: 24 }, { scale: 0.9 }] },
    animations: {
      transform: [{ translateY: withSpring(0, POP) }, { scale: withSpring(1, POP) }],
    },
  }
}

// The private thread with the model over the chat. It goes in the composer's accessory
// slot, so it rides the keyboard together with the field.
export function AsidePanel({ turns, pending, draft, phase, error, composerHeight, onRetry, onClose, onSelectText }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const { height: screenHeight } = useWindowDimensions()
  const keyboard = useReanimatedKeyboardAnimation()
  const scrollRef = useRef<ScrollView>(null)

  // Never taller than the room left between the header and the field, which the keyboard
  // lifts by its height less the home indicator inset the field already pads for.
  const fit = useAnimatedStyle(() => {
    const below = composerHeight.value + Math.max(0, Math.abs(keyboard.height.value) - insets.bottom)
    return { maxHeight: Math.min(screenHeight * 0.55, screenHeight - headerHeight - below - 20) }
  })

  const waiting = pending !== null && phase !== 'idle' && !draft?.text
  const empty = !turns.length && pending === null

  return (
    <Animated.View entering={unfold} style={[styles.slot, fit]}>
      {/* The glass is a layer beside the content, not around it: clipped to scroll the
          thread inside, it would lose its material. The content is clipped instead. */}
      <View style={styles.panel}>
        <GlassSurface style={styles.layer} fallbackStyle={styles.solid} />
        <View style={styles.clip}>
          <View style={styles.head}>
            <Ionicons name="eye-off" size={15} color={colors.textMuted} />
            <Text style={styles.title}>{t('chat.privateTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            // Not animated: while a reply streams the size changes every frame, and each
            // animated scroll would restart the last one.
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {empty ? <Text style={styles.hint}>{t('chat.privateHint')}</Text> : null}
            {turns.map((turn, i) => (
              <View key={i} style={styles.turn}>
                <Question text={turn.question} />
                {turn.thought ? <ThoughtBlock text={turn.thought.text} ms={turn.thought.ms} /> : null}
                <Pressable onLongPress={() => onSelectText(turn.answer)} delayLongPress={LONG_PRESS_MS}>
                  <Text style={styles.answer}>{turn.answer}</Text>
                </Pressable>
              </View>
            ))}
            {pending !== null ? (
              <View style={styles.turn}>
                <Question text={pending} />
                {draft?.thought ? <ThoughtBlock text={draft.thought} ms={draft.thinkingMs} /> : null}
                {draft?.text ? <Text style={styles.answer}>{draft.text.trimStart()}</Text> : null}
                {waiting && !draft?.thought ? <TypingIndicator /> : null}
              </View>
            ) : null}
            {error ? <ErrorCard message={error} onRetry={onRetry} /> : null}
          </ScrollView>
        </View>
      </View>
    </Animated.View>
  )
}

function Question({ text }: { text: AsideQuestion }) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.question}>
      {text.images.length ? (
        <View style={styles.pictures}>
          {text.images.map((image, i) => {
            const uri = imageDataUrl(image.base64)
            return (
              <ImageLink key={i} uri={uri} aspect={image.width && image.height ? image.width / image.height : 1}>
                <Image source={{ uri }} style={styles.picture} contentFit="cover" />
              </ImageLink>
            )
          })}
        </View>
      ) : null}
      {text.text ? <Text style={styles.questionText}>{text.text}</Text> : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    slot: { alignSelf: 'center', width: '100%', paddingHorizontal: 10, marginBottom: 8, transformOrigin: 'bottom' },
    panel: { flexShrink: 1 },
    layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 24, borderCurve: 'continuous' },
    clip: { flexShrink: 1, borderRadius: 24, borderCurve: 'continuous', overflow: 'hidden' },
    solid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
    title: { flex: 1, color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    scroll: { flexGrow: 0, flexShrink: 1 },
    content: { paddingHorizontal: 16, paddingBottom: 14 },
    hint: { color: colors.textFaint, fontSize: 14, lineHeight: 20 },
    turn: { gap: 8, marginTop: 8 },
    question: {
      alignSelf: 'flex-end',
      maxWidth: '85%',
      backgroundColor: colors.bubble,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    questionText: { color: colors.text, fontSize: 15, lineHeight: 20 },
    pictures: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
    picture: { width: 64, height: 64, borderRadius: 10 },
    answer: { color: colors.text, fontFamily: fonts.prose, fontSize: 16, lineHeight: 24 },
  })
