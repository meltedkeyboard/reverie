import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import type { BackgroundEffect } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { useColors, useStyles, type Colors } from '@/theme'

import { ChatBackground } from '../chat/ChatBackground'
import { ButtonCell, ListSection } from '../lists/GroupedList'
import type { MenuItem } from '../overlays/NativeMenu'

type Props = {
  greeting: string
  systemPrompt: string
  // The settings as they read, already put in words by the screen.
  params: { label: string; value: string }[]
  background: { uri: string; effect: BackgroundEffect; intensity: number } | null
  // The choices of the export button at the bottom; without them there is no button.
  exportItems?: MenuItem[]
}

// A character to look at rather than to edit, as a Telegram profile: under the avatar
// what the character is, and how it answers, in the grouped look of the editor. The name stays in the header, from where it
// moves onto the photo when the avatar spreads. Empty parts are left out.
export function CharacterProfile({ greeting, systemPrompt, params, background, exportItems }: Props) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()

  return (
    <View>
      {systemPrompt.trim() ? (
        <ListSection header={t('editor.systemPromptLabel')}>
          <View style={styles.textCell}>
            <ClampedText text={systemPrompt} lines={6} />
          </View>
        </ListSection>
      ) : null}
      {greeting.trim() ? (
        <ListSection header={t('editor.greetingLabel')}>
          <View style={styles.textCell}>
            <ClampedText text={greeting} lines={4} />
          </View>
        </ListSection>
      ) : null}
      <ListSection header={t('editor.genParamsSection')}>
        {params.map((param) => (
          <View key={param.label} style={styles.param}>
            <Text style={styles.paramLabel}>{param.label}</Text>
            <Text style={styles.paramValue}>{param.value}</Text>
          </View>
        ))}
      </ListSection>
      {background ? (
        <ListSection header={t('background.title')}>
          <View style={styles.backgroundCell}>
            <View style={styles.backgroundThumb}>
              <ChatBackground uri={background.uri} effect={background.effect} intensity={background.intensity} />
            </View>
          </View>
        </ListSection>
      ) : null}
      {/* Each way out is a row of its own rather than a menu: the system menu jumps
          behind the scroll as it closes on iOS 26 and 27. */}
      {exportItems ? (
        <ListSection header={t('card.export')}>
          {exportItems.map((item) => (
            <ButtonCell key={item.label} label={item.label} onPress={() => item.onSelect?.()} />
          ))}
        </ListSection>
      ) : null}
    </View>
  )
}

// iOS moves things on a critically damped spring of about half a second; clamped, so the
// height never passes the text and settles back.
const SPRING = { stiffness: 170, damping: 26, mass: 1, overshootClamping: true }
const OPEN_BASE_MS = 340
const OPEN_MS_PER_PX = 0.9
const OPEN_MAX_MS = 760
// A soft start and a long settle, so the text eases out of the fold instead of snapping.
const OPEN_EASING = Easing.bezier(0.4, 0, 0.2, 1)
const LINE_HEIGHT = 23

// A long text cut to a few lines with "more" at the end of the last one, over the text
// fading out, as in the App Store. The box then springs open to the whole text, with the
// link to cut it again laid under it inside the box, so nothing appears in a jump. Two
// copies laid out out of sight, cut and whole, tell the heights and whether it is cut.
// The whole text opens and closes on a tap, not only the link; a long press brings the
// system menu with Copy.
function ClampedText({ text, lines }: { text: string; lines: number }) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(0)
  const [whole, setWhole] = useState(0)
  const measured = cut > 0 && whole > 0
  const long = measured && whole > cut + 1
  const progress = useSharedValue(0)
  // The line height grows with the text size, and "more" has to sit on the last line.
  const { fontScale } = useWindowDimensions()
  const line = LINE_HEIGHT * fontScale
  const lessHeight = LESS_HEIGHT * fontScale

  // Opening is timed by how far the box has to grow: a spring covers any distance in the
  // same half second, so a long text jumped open. Closing keeps the spring.
  useEffect(() => {
    if (!open) {
      progress.value = withSpring(0, SPRING)
      return
    }
    const distance = Math.max(0, whole + lessHeight - cut)
    progress.value = withTiming(1, { duration: Math.min(OPEN_MAX_MS, OPEN_BASE_MS + distance * OPEN_MS_PER_PX), easing: OPEN_EASING })
  }, [open, progress, whole, cut, lessHeight])

  // Open, the box also holds the "show less" line under the text.
  const box = useAnimatedStyle(() => (long ? { height: cut + (whole + lessHeight - cut) * progress.value } : {}))
  const collapsed = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))
  const expanded = useAnimatedStyle(() => ({ opacity: progress.value }))

  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', pointerEvents: 'none' } as const
  // The text now sits in a group, so "more" and its fade take the group's fill.
  const bg = colors.surface
  return (
    <View>
      <Text style={[styles.text, styles.measure]} onLayout={(e) => setWhole(e.nativeEvent.layout.height)} {...hidden}>
        {text}
      </Text>
      <Text style={[styles.text, styles.measure]} numberOfLines={lines} onLayout={(e) => setCut(e.nativeEvent.layout.height)} {...hidden}>
        {text}
      </Text>

      <Animated.View style={[styles.clip, box]}>
        {/* Cut by the box once both heights are known; until then by its own lines. */}
        <Text
          style={styles.text}
          numberOfLines={measured ? undefined : lines}
          onPress={long ? () => setOpen((o) => !o) : undefined}
          // The long press belongs to the system menu; handled here only so it isn't also a tap.
          onLongPress={() => {}}
          selectable
        >
          {text}
        </Text>
        {long ? (
          <Animated.View style={[styles.less, { height: lessHeight }, expanded]} pointerEvents={open ? 'auto' : 'none'}>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={styles.link}>{t('profile.showLess')}</Text>
            </Pressable>
          </Animated.View>
        ) : null}
        {long ? (
          <Animated.View style={[styles.more, { top: cut - line, height: line }, collapsed]} pointerEvents={open ? 'none' : 'box-none'}>
            <LinearGradient colors={[`${bg}00`, bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.moreFade} />
            <Pressable onPress={() => setOpen(true)} hitSlop={8} style={[styles.moreButton, { backgroundColor: bg }]}>
              <Text style={styles.link}>{t('profile.showMore')}</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  )
}

const LESS_HEIGHT = 34

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    textCell: { paddingHorizontal: 16, paddingVertical: 14 },
    text: { color: colors.text, fontSize: 16, lineHeight: LINE_HEIGHT },
    // Out of the flow and unseen, only to measure the text cut and whole.
    measure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
    clip: { overflow: 'hidden' },
    // "more" over the end of the last line shown, the text fading out before it.
    more: { position: 'absolute', right: 0, flexDirection: 'row' },
    moreFade: { width: 48 },
    moreButton: { justifyContent: 'center', paddingLeft: 2 },
    less: { justifyContent: 'flex-end', alignItems: 'flex-start' },
    link: { color: colors.accent, fontSize: 16, lineHeight: LINE_HEIGHT },
    // A label and its value, as a row of Settings > General > About.
    param: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 16 },
    paramLabel: { flexShrink: 1, color: colors.text, fontSize: 17 },
    paramValue: { color: colors.textMuted, fontSize: 17, fontVariant: ['tabular-nums'], textAlign: 'right' },
    backgroundCell: { alignItems: 'center', paddingVertical: 12 },
    backgroundThumb: {
      width: 90,
      height: 120,
      borderRadius: 14,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
    },
  })
