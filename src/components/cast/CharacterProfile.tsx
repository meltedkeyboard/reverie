import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import type { BackgroundEffect } from '@/db/characters'
import { useTranslation } from '@/i18n'
import type { CropRect } from '@/lib/images/avatars'
import { useColors, useStyles, type Colors } from '@/theme'

import { ChatBackground } from '../chat/ChatBackground'
import { ButtonCell, ListSection } from '../lists/GroupedList'
import { NativeActionRow, NativeForm, NativeHostedRow, NativeSection, nativeForm } from '../lists/NativeForm'
import { BackgroundThumbCell } from '../lists/PictureCells'
import type { MenuItem } from '../overlays/NativeMenu'

type Props = {
  greeting: string
  systemPrompt: string
  notes: string
  // The settings as they read, already put in words by the screen.
  params: { label: string; value: string }[]
  background: { uri: string; crop: CropRect | null; effect: BackgroundEffect; intensity: number } | null
  // The choices of the export button at the bottom; without them there is no button.
  exportItems?: MenuItem[]
  // The character's gallery, under its texts.
  gallery?: React.ReactNode
}

// A character to look at rather than to edit, as a Telegram profile: under the avatar
// what the character is, and how it answers, in the grouped look of the editor. The name stays in the header, from where it
// moves onto the photo when the avatar spreads. Empty parts are left out.
export function CharacterProfile({ greeting, systemPrompt, notes, params, background, exportItems, gallery }: Props) {
  const { t } = useTranslation()

  return (
    <View>
      <ProfileText header={t('editor.systemPromptLabel')} text={systemPrompt} lines={6} />
      <ProfileText header={t('editor.greetingLabel')} text={greeting} lines={4} />
      <ProfileText header={t('editor.notesLabel')} text={notes} lines={4} />
      {gallery}
      <ProfileParams header={t('editor.genParamsSection')} params={params} />
      <ProfileBackground background={background} />
      {exportItems ? <ProfileActions header={t('card.export')} items={exportItems} /> : null}
    </View>
  )
}

// The same profile on iOS 18 and later with SwiftUI, laid into the screen's scroll view under
// the avatar: the texts are the profile's own cards, whose opening grows the page smoothly,
// which a row of the system's list could not do (it takes its new height at once), and the
// rest is the system's own list. The list does not scroll itself but is as tall as what it
// holds, so the photo, the glow and the header keep following the scroll view as they did.
// `style` takes the list out to the edges of the screen, since it keeps its own margins, and
// `linkColor`, the color of the glow, tints "more" and "show less".
export function NativeProfileList({ style, linkColor, ...profile }: Props & { style?: StyleProp<ViewStyle>; linkColor?: string }) {
  const { t } = useTranslation()
  return (
    <View>
      <ProfileText header={t('editor.systemPromptLabel')} text={profile.systemPrompt} lines={6} system ink={linkColor} />
      <ProfileText header={t('editor.greetingLabel')} text={profile.greeting} lines={4} system ink={linkColor} />
      <ProfileText header={t('editor.notesLabel')} text={profile.notes} lines={4} system ink={linkColor} />
      {profile.gallery}
      <SystemProfileRest
        paramsHeader={t('editor.genParamsSection')}
        params={profile.params}
        background={profile.background}
        exportHeader={t('card.export')}
        exportItems={profile.exportItems}
        style={style}
      />
    </View>
  )
}

// The end of a profile, a character's or a room's, as the system's own list under the
// profile's cards: its settings, its background and the ways to export it. The list does not
// scroll itself but is as tall as what it holds; `style` takes it out to the edges of the
// screen, since it keeps its own margins.
export function SystemProfileRest({
  paramsHeader,
  params,
  background,
  exportHeader,
  exportItems,
  style,
}: {
  paramsHeader: string
  params: Props['params']
  background: Props['background']
  exportHeader: string
  exportItems?: MenuItem[]
  style?: StyleProp<ViewStyle>
}) {
  return (
    <SystemListBlock style={style}>
      <SystemProfileSections paramsHeader={paramsHeader} params={params} background={background} exportHeader={exportHeader} exportItems={exportItems} />
    </SystemListBlock>
  )
}

// A piece of the system's own list laid into a page's scroll view: it does not scroll itself
// but is as tall as the sections it holds. `style` takes it out to the edges of the screen,
// since it keeps its own margins.
export function SystemListBlock({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const styles = useStyles(createStyles)
  const { height: screenHeight } = useWindowDimensions()
  // As tall as the screen at first, so that the list lays out its rows rather than guessing
  // their heights; then as tall as its content, which it reports whenever that changes.
  const [height, setHeight] = useState(screenHeight)
  const { scrollDisabled, ignoreSafeArea, useScrollGeometryChange } = nativeForm!.modifiers
  const measure = useScrollGeometryChange((g) => {
    const next = Math.ceil(g.contentHeight)
    if (next > 0) setHeight((was) => (Math.abs(was - next) > 1 ? next : was))
  })
  return (
    <View style={[styles.systemList, { height }, style]}>
      {/* Under the status bar as the page scrolls, the list would take in the safe area and
          move its rows down by as much. */}
      <NativeForm clear modifiers={[scrollDisabled(true), ignoreSafeArea(), ...(measure ? [measure] : [])]}>
        {children}
      </NativeForm>
    </View>
  )
}

// The settings are the system's rows, the background's thumbnail a React Native view in a row
// of its own.
function SystemProfileSections({
  paramsHeader,
  params,
  background,
  exportHeader,
  exportItems,
}: Omit<React.ComponentProps<typeof SystemProfileRest>, 'style'>) {
  const { t } = useTranslation()
  const { LabeledContent, Text } = nativeForm!.ui
  return (
    <>
      {params.length ? (
        <NativeSection title={paramsHeader}>
          {params.map((param) => (
            <LabeledContent key={param.label} label={param.label}>
              <Text>{param.value}</Text>
            </LabeledContent>
          ))}
        </NativeSection>
      ) : null}
      {background ? (
        <NativeSection title={t('background.title')}>
          <NativeHostedRow>
            <BackgroundThumbCell uri={background.uri} crop={background.crop} effect={background.effect} intensity={background.intensity} />
          </NativeHostedRow>
        </NativeSection>
      ) : null}
      {exportItems ? (
        <NativeSection title={exportHeader}>
          {exportItems.map((item) => (
            <NativeActionRow key={item.label} label={item.label} onPress={() => item.onSelect?.()} />
          ))}
        </NativeSection>
      ) : null}
    </>
  )
}

// The parts a profile is made of, a character's or a room's.

// A long text under its header, cut to a few lines; nothing for an empty one. `system` draws
// it as the sections of the system's list beside it are: the header in sentence case, the
// text at the size of a row's; `ink` is the color of "more" and "show less".
export function ProfileText({ header, text, lines, system = false, ink }: { header: string; text: string; lines: number; system?: boolean; ink?: string }) {
  const styles = useStyles(createStyles)
  if (!text.trim()) return null
  return (
    <ListSection header={header} plainHeader={system}>
      <View style={[styles.textCell, system && styles.systemTextCell]}>
        <ClampedText text={text} lines={lines} large={system} ink={ink} />
      </View>
    </ListSection>
  )
}

// Settings as they read, already put in words by the screen.
export function ProfileParams({ header, params }: { header?: string; params: { label: string; value: string }[] }) {
  const styles = useStyles(createStyles)
  if (!params.length) return null
  return (
    <ListSection header={header}>
      {params.map((param) => (
        <View key={param.label} style={styles.param}>
          <Text style={styles.paramLabel}>{param.label}</Text>
          <Text style={styles.paramValue}>{param.value}</Text>
        </View>
      ))}
    </ListSection>
  )
}

// The picture behind the chats, small, as it looks behind them.
export function ProfileBackground({ background }: { background: Props['background'] }) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  if (!background) return null
  return (
    <ListSection header={t('background.title')}>
      <View style={styles.backgroundCell}>
        <View style={styles.backgroundThumb}>
          <ChatBackground uri={background.uri} crop={background.crop} effect={background.effect} intensity={background.intensity} />
        </View>
      </View>
    </ListSection>
  )
}

// Each way out is a row of its own rather than a menu: the system menu jumps behind the
// scroll as it closes on iOS 26 and 27.
export function ProfileActions({ header, items }: { header: string; items: MenuItem[] }) {
  return (
    <ListSection header={header}>
      {items.map((item) => (
        <ButtonCell key={item.label} label={item.label} onPress={() => item.onSelect?.()} />
      ))}
    </ListSection>
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
// The text of a row of the system's list, for a profile beside one.
const LARGE_LINE_HEIGHT = 22

// A long text cut to a few lines with "more" at the end of the last one, over the text
// fading out, as in the App Store. The box then springs open to the whole text, with the
// link to cut it again laid under it inside the box, so nothing appears in a jump. Two
// copies laid out out of sight, cut and whole, tell the heights and whether it is cut.
// The whole text opens and closes on a tap, not only the link; a long press brings the
// system menu with Copy.
function ClampedText({ text, lines, large = false, ink }: { text: string; lines: number; large?: boolean; ink?: string }) {
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
  const line = (large ? LARGE_LINE_HEIGHT : LINE_HEIGHT) * fontScale
  const lessHeight = LESS_HEIGHT * fontScale
  const textStyle = [styles.text, large && styles.large]
  const linkStyle = [styles.link, large && styles.large, ink ? { color: ink } : null]

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
      <Text style={[textStyle, styles.measure]} onLayout={(e) => setWhole(e.nativeEvent.layout.height)} {...hidden}>
        {text}
      </Text>
      <Text style={[textStyle, styles.measure]} numberOfLines={lines} onLayout={(e) => setCut(e.nativeEvent.layout.height)} {...hidden}>
        {text}
      </Text>

      <Animated.View style={[styles.clip, box]}>
        {/* Cut by the box once both heights are known; until then by its own lines. */}
        <Text
          style={textStyle}
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
              <Text style={linkStyle}>{t('profile.showLess')}</Text>
            </Pressable>
          </Animated.View>
        ) : null}
        {long ? (
          <Animated.View style={[styles.more, { top: cut - line, height: line }, collapsed]} pointerEvents={open ? 'none' : 'box-none'}>
            <LinearGradient colors={[`${bg}00`, bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.moreFade} />
            <Pressable onPress={() => setOpen(true)} hitSlop={8} style={[styles.moreButton, { backgroundColor: bg }]}>
              <Text style={linkStyle}>{t('profile.showMore')}</Text>
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
    systemTextCell: { paddingVertical: 12 },
    large: { fontSize: 17, lineHeight: LARGE_LINE_HEIGHT },
    // The list keeps room of its own above its first section, a little less than the card's
    // margin; together they come to the space between two of the list's sections.
    systemList: { marginTop: -10 },
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
