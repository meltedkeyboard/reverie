import { Icon } from '@/components/visuals/Icon'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import type { LastChat } from '@/db/chats'
import type { ContinueKind } from '@/db/prefs/continue'
import { useLastChatContext } from '@/hooks/chat/useLastChat'
import { useTranslation } from '@/i18n'
import { formatWhen } from '@/lib/core/format'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { Avatar } from '../visuals/Avatar'
import { GlassSurface } from '../chrome/Glass'
import { SwipeToDelete } from '../lists/SwipeToDelete'

type Props = {
  // Which home tab the button is showing the chat of.
  kind: ContinueKind
  chat: LastChat
  // Distance from the bottom of the window to where the tab's content ends.
  bottom: number
  onOpen: () => void
  onDismiss: () => void
}

// Text on the accent-tinted glass, as on the glass Button.
const ON_ACCENT_MUTED = 'rgba(255, 255, 255, 0.75)'
const ON_ACCENT_FAINT = 'rgba(255, 255, 255, 0.6)'

const HEIGHT = 56

// How much room the list leaves under its last card for the button.
export const CONTINUE_BUTTON_SPACE = HEIGHT + 20

const OUT_MS = 140
const IN_MS = 260
const SHIFT = 8

// The one continue button of the home tabs, drawn by the tabs layout over whichever of
// Characters and Rooms is open, so switching between them changes only what it shows.
export function HomeContinueButton({ kind }: { kind: ContinueKind | null }) {
  const router = useRouter()
  const { chats, hide, bottom, suspended } = useLastChatContext()
  const chat = kind ? chats[kind] : null
  if (!kind || !chat || suspended) return null
  return (
    <ContinueButton
      kind={kind}
      chat={chat}
      bottom={bottom}
      onOpen={() => router.push(`/chat/${chat.id}`)}
      onDismiss={() => hide(kind)}
    />
  )
}

// A glass capsule floating over the bottom of the home screen that opens the last chat,
// and swipes away like a row in a list. When it comes to lead to another chat, the old
// content slides out and the new one in, while the glass capsule stays where it is. On a
// switch to the other tab the content just changes.
export function ContinueButton({ kind, chat, bottom, onOpen, onDismiss }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()

  const subtitle = (c: LastChat) => c.title ?? formatWhen(c.lastActivity, locale)
  // Every focus of a tab reloads the chat as a fresh object, so only a change of what is
  // written on the button counts.
  const looksSame = (a: LastChat, b: LastChat) =>
    a.id === b.id && a.characterName === b.characterName && a.characterAvatar === b.characterAvatar && subtitle(a) === subtitle(b)

  const [shown, setShown] = useState(chat)
  const shownRef = useRef(shown)
  shownRef.current = shown
  const fade = useSharedValue(1)
  const shift = useSharedValue(0)
  const swapped = useRef(shown)
  const lastKind = useRef(kind)

  useEffect(() => {
    const switched = lastKind.current !== kind
    lastKind.current = kind
    if (looksSame(chat, shownRef.current)) return
    if (switched) {
      // Another tab: the content changes at once. Setting the values cancels a slide in
      // progress, so its callback never swaps.
      fade.value = 1
      shift.value = 0
      swapped.current = chat
      setShown(chat)
      return
    }
    // A newer chat arriving mid-slide restarts it, and the cancelled one never swaps.
    fade.value = withTiming(0, { duration: OUT_MS }, (finished) => {
      if (finished) scheduleOnRN(setShown, chat)
    })
    shift.value = withTiming(-SHIFT, { duration: OUT_MS })
  }, [chat, kind])

  useEffect(() => {
    if (swapped.current === shown) return
    swapped.current = shown
    const ease = { duration: IN_MS, easing: Easing.out(Easing.cubic) }
    fade.value = withTiming(1, ease)
    shift.value = withSequence(withTiming(SHIFT, { duration: 0 }), withTiming(0, ease))
  }, [shown, fade, shift])

  // Only the content fades: Liquid Glass renders wrongly under a fading parent.
  const contentStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: shift.value }],
  }))

  return (
    <View style={[styles.slot, { bottom: bottom + 8 }]} pointerEvents="box-none">
      <SwipeToDelete
        throwAway
        radius={HEIGHT / 2}
        label={t('continue.hide')}
        contentLabel={t('continue.accessibility')}
        onPress={onOpen}
        onDelete={onDismiss}
      >
        <GlassSurface interactive tintColor={colors.accent} style={styles.pill} fallbackStyle={styles.solid}>
          <Animated.View style={[styles.content, contentStyle]}>
            <Avatar name={shown.characterName} file={shown.characterAvatar} size={HEIGHT - 16} viewable={false} />
            <View style={styles.text}>
              <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={styles.name} numberOfLines={1}>
                {shown.characterName}
              </Text>
              <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={styles.title} numberOfLines={1}>
                {subtitle(shown)}
              </Text>
            </View>
          </Animated.View>
          <Icon name="chevron-forward" size={18} color={ON_ACCENT_FAINT} />
        </GlassSurface>
      </SwipeToDelete>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    slot: { position: 'absolute', left: 16, right: 16 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      height: HEIGHT,
      borderRadius: HEIGHT / 2,
      borderCurve: 'continuous',
      // Opaque under the glass, so the cards scrolling beneath do not show through it. The color
      // of the screen, not the accent: the tinted glass blends with what is behind it, and over
      // the accent it came out darker than the buttons in Settings.
      backgroundColor: colors.bg,
      padding: 8,
      paddingRight: 16,
    },
    solid: { backgroundColor: colors.accent },
    content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    text: { flex: 1 },
    name: { color: ON_ACCENT, fontSize: 16, fontWeight: '600' },
    title: { color: ON_ACCENT_MUTED, fontSize: 13, marginTop: 1 },
  })
