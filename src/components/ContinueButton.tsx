import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import type { LastChat } from '@/db/chats'
import { useTranslation } from '@/i18n'
import { formatWhen } from '@/lib/format'
import * as Haptics from '@/lib/haptics'
import { useColors, useStyles, type Colors } from '@/theme'

import { Avatar } from './Avatar'
import { GlassSurface } from './Glass'

type Props = {
  chat: LastChat
  onOpen: () => void
  onDismiss: () => void
}

// Text on the accent-tinted glass, as on the glass Button.
const ON_ACCENT = '#FFFFFF'
const ON_ACCENT_MUTED = 'rgba(255, 255, 255, 0.75)'
const ON_ACCENT_FAINT = 'rgba(255, 255, 255, 0.6)'

const HEIGHT = 56
const GAP = 8
// How far the capsule stays pulled to the left with the trash button showing.
const REVEAL = HEIGHT + GAP
const SPRING = { damping: 20, stiffness: 240 }

// How much room the list leaves under its last card for the button.
export const CONTINUE_BUTTON_SPACE = HEIGHT + 20

// A glass capsule floating over the bottom of the home screen that opens the last chat.
// Like a row in an iOS list, a swipe to the left uncovers a trash button, and a long
// swipe throws the capsule away at once.
export function ContinueButton({ chat, onOpen, onDismiss }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { t, locale } = useTranslation()
  const offset = useSharedValue(0)
  const start = useSharedValue(0)
  const armed = useSharedValue(false)
  const pressed = useSharedValue(false)
  // Past this pull letting go dismisses the capsule without a tap on the trash.
  const full = width * 0.5

  const dismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onDismiss()
  }

  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

  const throwAway = () => {
    'worklet'
    offset.value = withTiming(-width - REVEAL, { duration: 220 }, (finished) => {
      if (finished) scheduleOnRN(dismiss)
    })
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      start.value = offset.value
    })
    .onUpdate((e) => {
      const raw = start.value + e.translationX
      // Nothing is behind the right edge, so a pull that way only gives a little.
      offset.value = raw > 0 ? raw * 0.2 : raw
      const past = -offset.value > full
      if (past !== armed.value) {
        armed.value = past
        scheduleOnRN(tick)
      }
    })
    .onEnd((e) => {
      if (armed.value) {
        throwAway()
      } else if (-offset.value > REVEAL / 2 || e.velocityX < -400) {
        offset.value = withSpring(-REVEAL, SPRING)
      } else {
        offset.value = withSpring(0, SPRING)
      }
    })

  const tap = Gesture.Tap()
    .onBegin(() => {
      pressed.value = true
    })
    .onFinalize(() => {
      pressed.value = false
    })
    .onEnd((_e, success) => {
      if (!success) return
      // With the trash showing, a tap on the capsule only closes it, as in a list.
      if (offset.value < 0) offset.value = withSpring(0, SPRING)
      else scheduleOnRN(onOpen)
    })

  // Liquid Glass renders wrongly under a fading parent, so the capsule only moves.
  const capsule = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value },
      { scale: withTiming(pressed.value ? 0.97 : 1, { duration: 120 }) },
    ],
  }))

  // The trash button fills the gap the capsule leaves and stretches with a long swipe.
  const trash = useAnimatedStyle(() => {
    const pulled = Math.max(0, -offset.value)
    return {
      width: Math.max(HEIGHT, pulled - GAP),
      opacity: interpolate(pulled, [0, REVEAL * 0.6], [0, 1], 'clamp'),
      transform: [{ scale: interpolate(pulled, [0, REVEAL], [0.6, 1], 'clamp') }],
    }
  })

  return (
    <View style={[styles.slot, { bottom: insets.bottom + 8 }]} pointerEvents="box-none">
      <Animated.View style={[styles.trashSlot, trash]}>
        <Pressable
          onPress={throwAway}
          accessibilityRole="button"
          accessibilityLabel={t('continue.hide')}
          style={({ pressed: down }) => [styles.trash, down && { opacity: 0.8 }]}
        >
          <Ionicons name="trash" size={22} color="#FFFFFF" />
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <Animated.View style={capsule} accessibilityRole="button" accessibilityLabel={t('continue.accessibility')}>
          <GlassSurface interactive tintColor={colors.accent} style={styles.pill} fallbackStyle={styles.solid}>
            <Avatar name={chat.characterName} file={chat.characterAvatar} size={HEIGHT - 16} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {chat.characterName}
              </Text>
              <Text style={styles.title} numberOfLines={1}>
                {chat.title ?? formatWhen(chat.lastActivity, locale)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ON_ACCENT_FAINT} />
          </GlassSurface>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    slot: { position: 'absolute', left: 16, right: 16 },
    trashSlot: { position: 'absolute', right: 0, top: 0, height: HEIGHT },
    trash: {
      flex: 1,
      borderRadius: HEIGHT / 2,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      height: HEIGHT,
      borderRadius: HEIGHT / 2,
      padding: 8,
      paddingRight: 16,
    },
    solid: { backgroundColor: colors.accent },
    text: { flex: 1 },
    name: { color: ON_ACCENT, fontSize: 16, fontWeight: '600' },
    title: { color: ON_ACCENT_MUTED, fontSize: 13, marginTop: 1 },
  })
