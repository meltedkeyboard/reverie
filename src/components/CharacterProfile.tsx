import { LinearGradient } from 'expo-linear-gradient'
import { Fragment, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import type { BackgroundEffect } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { useColors, useStyles, type Colors } from '@/theme'

import { ChatBackground } from './ChatBackground'
import { Divider } from './motifs/Divider'
import { Eyebrow } from './motifs/Eyebrow'

type Props = {
  greeting: string
  systemPrompt: string
  // The settings as they read, already put in words by the screen.
  params: { label: string; value: string }[]
  background: { uri: string; effect: BackgroundEffect; intensity: number } | null
}

// A character to look at rather than to edit, as a Telegram profile: under the avatar
// what the character is, and how it answers. The name stays in the header, from where it
// moves onto the photo when the avatar spreads. Empty parts are left out.
export function CharacterProfile({ greeting, systemPrompt, params, background }: Props) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()

  const sections = [
    systemPrompt.trim() ? (
      <Fragment key="prompt">
        <Eyebrow label={t('editor.systemPromptLabel')} color={colors.text} />
        <ClampedText text={systemPrompt} lines={6} />
      </Fragment>
    ) : null,
    greeting.trim() ? (
      <Fragment key="greeting">
        <Eyebrow label={t('editor.greetingLabel')} color={colors.text} />
        <ClampedText text={greeting} lines={4} />
      </Fragment>
    ) : null,
    <Fragment key="params">
      <Eyebrow label={t('editor.genParamsSection')} color={colors.text} />
      <View style={styles.params}>
        {params.map((param, i) => (
          <View key={param.label} style={[styles.param, i > 0 && styles.paramRule]}>
            <Text style={styles.paramLabel}>{param.label}</Text>
            <Text style={styles.paramValue}>{param.value}</Text>
          </View>
        ))}
      </View>
    </Fragment>,
    background ? (
      <Fragment key="background">
        <Eyebrow label={t('background.title')} color={colors.text} />
        <View style={styles.backgroundThumb}>
          <ChatBackground uri={background.uri} effect={background.effect} intensity={background.intensity} />
        </View>
      </Fragment>
    ) : null,
  ].filter(Boolean)

  return (
    <View style={styles.profile}>
      {sections.map((section, i) => (
        <Fragment key={i}>
          {i > 0 ? <Divider /> : null}
          {section}
        </Fragment>
      ))}
    </View>
  )
}

// iOS moves things on a critically damped spring of about half a second; clamped, so the
// height never passes the text and settles back.
const SPRING = { stiffness: 170, damping: 26, mass: 1, overshootClamping: true }
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

  useEffect(() => {
    progress.value = withSpring(open ? 1 : 0, SPRING)
  }, [open, progress])

  // Open, the box also holds the "show less" line under the text.
  const box = useAnimatedStyle(() => (long ? { height: cut + (whole + lessHeight - cut) * progress.value } : {}))
  const collapsed = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))
  const expanded = useAnimatedStyle(() => ({ opacity: progress.value }))

  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', pointerEvents: 'none' } as const
  const bg = colors.bg
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
    // Where the editor has the photo links, so the first section sits at the same height.
    profile: { marginTop: 12 },
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
    params: { marginTop: 2 },
    param: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, paddingVertical: 11 },
    paramRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    paramLabel: { flexShrink: 1, color: colors.textMuted, fontSize: 15 },
    paramValue: { color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'right' },
    backgroundThumb: {
      width: 72,
      height: 96,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
    },
  })
