import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PixelRatio, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { scheduleOnRN } from 'react-native-worklets'

import { Button } from '@/components/controls/Button'
import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useHeaderHeight } from '@/components/chrome/GlassHeader'
import { Icon } from '@/components/visuals/Icon'
import { useTranslation } from '@/i18n'
import { isWeb } from '@/lib/core/platform'
import { APP_ICONS, currentAppIcon, followsLook, previewFor, setAppIcon, type AppIcon } from '@/lib/settings/appIcons'
import * as Haptics from '@/lib/ui/haptics'
import { reportError } from '@/lib/transfer/report'
import { fonts, ON_ACCENT, useStyles, useTheme, type Colors, type Scheme } from '@/theme'

const COUNT = APP_ICONS.length
// iOS rounds an icon at this share of its side.
const CORNER = 0.2237
// The previews are rendered for this size at 3x (tools/build-icons.mjs).
const MAX_ART = 220
// The neighbours stand back, smaller and fainter the further they are from the middle.
const NEIGHBOR_SCALE = 0.8
// Between the icon in the middle and a neighbour, as it looks with the neighbour shrunk.
const GAP = 32
// The name's top under the icon, and the dots under the name and its caption.
const NAME_GAP = 22
const DOTS_GAP = 24
const DOT = 7
// The least room kept above the icon and under the dots.
const AIR = 16
// The name's and the caption's lines, and how far they grow with the text size.
const TITLE_LINE = 36
const CAPTION_LINE = 20
const TITLE_SCALE = 1.3
const CAPTION_SCALE = 1.4
// The button with the space around it, until it is measured.
const FOOTER = 12 + 52 + 16
// The icon with its name sits a little above the middle of its room, where the eye takes
// the middle to be.
const LIFT = 0.06
// Past halfway to the next icon by this share of a step before that one counts as the one
// in the middle, so a finger resting near halfway does not tick back and forth.
const HYSTERESIS = 0.08
// How far a name drifts along with the swipe as it fades.
const NAME_DRIFT = 18
// The badge of the icon just chosen comes in with a little bounce, and the screen closes
// once it has landed.
const POP = { duration: 450, dampingRatio: 0.6 }
const CLOSE_AFTER = 400
// Two shadows, as something lifted off a page casts: a close one and a soft one below.
const SHADOW: Record<Scheme, string> = {
  light: '0 2px 6px rgba(0, 0, 0, 0.08), 0 12px 28px rgba(0, 0, 0, 0.14)',
  dark: '0 2px 6px rgba(0, 0, 0, 0.3), 0 12px 28px rgba(0, 0, 0, 0.45)',
}
// How strongly the glow behind the icon starts at its edge: a dark page carries more of it
// before it looks muddy.
const GLOW: Record<Scheme, number> = { light: 0.3, dark: 0.45 }

type Size = { width: number; height: number }

// Where everything goes on a screen of this size. The icon's side is about half the width,
// less where a short screen (a phone on its side) needs it, and keeps the parity of the
// width, so the icon in the middle stands on whole points and stays sharp. The icon, its
// name and the dots are centered as one between the header and the button.
function stageLayout(screen: Size, header: number, footer: number, fontScale: number) {
  const names = Math.ceil(TITLE_LINE * Math.min(fontScale, TITLE_SCALE) + 2 + CAPTION_LINE * Math.min(fontScale, CAPTION_SCALE))
  const below = NAME_GAP + names + DOTS_GAP + DOT
  const room = screen.height - header - footer
  const odd = Math.round(screen.width) % 2
  const fit = Math.max(96, Math.min(screen.width * 0.48, MAX_ART, room * (1 - LIFT) - below - 2 * AIR))
  const art = even(fit - odd) + odd
  const step = art + even(GAP - (art * (1 - NEIGHBOR_SCALE)) / 2)
  const iconTop = Math.round(header + (room - art - below) / 2 - (room * LIFT) / 2)
  const namesTop = iconTop + art + NAME_GAP
  return {
    art,
    step,
    side: PixelRatio.roundToNearestPixel((screen.width - step) / 2),
    iconTop,
    namesTop,
    names,
    dotsTop: namesTop + names + DOTS_GAP,
  }
}

function even(value: number) {
  return 2 * Math.round(value / 2)
}

// The icons in a strip swiped through one at a time, the one in the middle shown as the
// Home Screen would show it, with its name under it and the button to take it at the foot.
// The strip is a scroll view over the whole screen, so a swipe anywhere but on the button
// moves it; its own snapping and deceleration carry it, and everything that follows it
// (the neighbours standing back, the names, the dots, the glow) is driven by its offset
// on the UI thread.
export default function AppIconScreen() {
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const window = useWindowDimensions()
  const router = useRouter()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const [current, setCurrent] = useState(currentAppIcon)
  const [shown, setShown] = useState(() => Math.max(0, APP_ICONS.findIndex((icon) => icon.name === current)))
  const [applying, setApplying] = useState(false)
  // The screen and the footer as laid out. Until they are measured the window and the
  // footer's usual height are taken, so everything is in place from the first frame.
  const [screen, setScreen] = useState<Size>(() => ({ width: window.width, height: window.height }))
  const [footer, setFooter] = useState(() => insets.bottom + FOOTER)
  const layout = stageLayout(screen, headerHeight, footer, window.fontScale)
  const { art, step } = layout

  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollX = useSharedValue(shown * step)
  const stepUI = useSharedValue(step)
  // The icon counted as the one in the middle on the UI thread.
  const centered = useSharedValue(shown)
  // Where a scroll started by a tap is going; the icons it passes on the way are not ticked.
  const target = useSharedValue(-1)
  const shownRef = useRef(shown)
  shownRef.current = shown

  // The scroll view gets an offset only when its geometry changes, as when the phone is
  // turned, and then the one of the icon in the middle. An offset changing with every icon
  // passed would be applied by the new architecture mid-swipe and throw the strip back.
  const offset = useMemo(() => ({ x: shownRef.current * step, y: 0 }), [step])
  useLayoutEffect(() => {
    stepUI.value = step
    scrollX.value = shownRef.current * step
    // The web's scroll view takes no contentOffset.
    if (isWeb) scrollRef.current?.scrollTo({ x: shownRef.current * step, animated: false })
  }, [step, stepUI, scrollX, scrollRef])

  const arrive = useCallback((index: number) => {
    setShown(index)
    Haptics.selectionAsync()
  }, [])

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x
      const at = event.contentOffset.x / stepUI.value
      if (target.value >= 0) {
        if (Math.abs(at - target.value) < 0.02) target.value = -1
        return
      }
      if (Math.abs(at - centered.value) < 0.5 + HYSTERESIS) return
      const next = Math.min(COUNT - 1, Math.max(0, Math.round(at)))
      if (next === centered.value) return
      centered.value = next
      scheduleOnRN(arrive, next)
    },
    // A finger on the strip takes over from a scroll a tap started.
    onBeginDrag: () => {
      target.value = -1
    },
  })

  // A tap on a neighbour, or a swipe up or down with VoiceOver, brings that icon to the
  // middle. The tick comes with the tap, not when the icon gets there.
  const go = (index: number) => {
    if (index < 0 || index >= COUNT || index === shownRef.current) return
    target.value = index
    centered.value = index
    setShown(index)
    Haptics.selectionAsync()
    scrollRef.current?.scrollTo({ x: index * step, animated: true })
  }

  const icon = APP_ICONS[shown]
  const inUse = icon.name === current
  const nameOf = (option: AppIcon) => t(`appIcon.${option.name ?? 'default'}`)

  // A screen left by hand before the close comes must not take the one under it along.
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (closing.current) clearTimeout(closing.current)
  }, [])

  // Taking an icon closes the screen. On iOS the system's own alert about the new icon
  // comes up over it at once, and the screen goes back underneath.
  const apply = async () => {
    setApplying(true)
    try {
      await setAppIcon(icon.name)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setCurrent(icon.name)
      closing.current = setTimeout(() => {
        if (router.canGoBack()) router.back()
      }, CLOSE_AFTER)
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      reportError(t('appIcon.failed'), err)
    } finally {
      setApplying(false)
    }
  }

  const glow = Math.round(art * 2.8)

  return (
    <View
      style={styles.screen}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout
        if (width !== screen.width || height !== screen.height) setScreen({ width, height })
      }}
    >
      {/* One adjustable element for VoiceOver, the icon in the middle its value. */}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('settings.appIcon')}
        accessibilityValue={{ text: inUse ? `${nameOf(icon)}, ${t('appIcon.inUse')}` : nameOf(icon) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => go(shown + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
        style={StyleSheet.absoluteFill}
      >
        <View
          pointerEvents="none"
          style={[styles.glow, { width: glow, height: glow, left: (screen.width - glow) / 2, top: layout.iconTop + (art - glow) / 2 }]}
        >
          {APP_ICONS.map((option, index) => (
            <Glow key={option.name ?? 'default'} index={index} color={option.glow} size={glow} scrollX={scrollX} step={step} />
          ))}
        </View>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          disableIntervalMomentum
          contentOffset={offset}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: layout.side }}
          style={[StyleSheet.absoluteFill, styles.strip]}
        >
          {APP_ICONS.map((option, index) => (
            <IconCard
              key={option.name ?? 'default'}
              icon={option}
              index={index}
              art={art}
              step={step}
              top={layout.iconTop}
              scrollX={scrollX}
              current={option.name === current}
              reduceMotion={reduceMotion}
              onPress={go}
            />
          ))}
        </Animated.ScrollView>
        {/* Over the strip, but a swipe on them still moves it. */}
        <View pointerEvents="none" style={[styles.names, { top: layout.namesTop, height: layout.names }]}>
          {APP_ICONS.map((option, index) => (
            <IconName
              key={option.name ?? 'default'}
              index={index}
              title={nameOf(option)}
              caption={followsLook(option) ? t('appIcon.followsLook') : null}
              scrollX={scrollX}
              step={step}
              drift={!reduceMotion}
            />
          ))}
        </View>
        <View pointerEvents="none" style={[styles.dots, { top: layout.dotsTop }]}>
          {APP_ICONS.map((option, index) => (
            <Dot key={option.name ?? 'default'} index={index} scrollX={scrollX} step={step} />
          ))}
        </View>
      </View>
      <View
        pointerEvents="box-none"
        style={styles.footerSpan}
        onLayout={(e: LayoutChangeEvent) => {
          const { height } = e.nativeEvent.layout
          if (height !== footer) setFooter(height)
        }}
      >
        <View
          pointerEvents="box-none"
          style={[styles.footer, { paddingBottom: insets.bottom + 16, paddingLeft: Math.max(24, insets.left + 16), paddingRight: Math.max(24, insets.right + 16) }]}
        >
          <Button
            variant="glass"
            icon={inUse ? 'checkmark' : undefined}
            label={inUse ? t('appIcon.inUse') : t('appIcon.apply')}
            onPress={apply}
            disabled={inUse}
            loading={applying}
          />
        </View>
      </View>
      <FormScreenHeader title={t('settings.appIcon')} />
    </View>
  )
}

type Track = { index: number; scrollX: SharedValue<number>; step: number }

function IconCard({
  icon,
  index,
  art,
  step,
  top,
  scrollX,
  current,
  reduceMotion,
  onPress,
}: Track & { icon: AppIcon; art: number; top: number; current: boolean; reduceMotion: boolean; onPress: (index: number) => void }) {
  const { scheme } = useTheme()
  const styles = useStyles(createStyles)
  const radius = art * CORNER
  const badge = Math.round(Math.min(32, Math.max(22, art * 0.15)))
  // Centered on the middle of the corner's curve, as a badge sits on an iOS icon.
  const inset = Math.round(art * 0.065 - badge / 2)

  const card = useAnimatedStyle(() => {
    const away = Math.abs(scrollX.value - index * step) / step
    return {
      opacity: interpolate(away, [0, 1, 2, 3], [1, 0.55, 0.25, 0], 'clamp'),
      transform: [{ scale: interpolate(away, [0, 1, 2], [1, NEIGHBOR_SCALE, 0.66], 'clamp') }],
    }
  })

  const mark = useSharedValue(current ? 1 : 0)
  useEffect(() => {
    if (!current) mark.value = withTiming(0, { duration: 160 })
    else mark.value = reduceMotion ? withTiming(1, { duration: 200 }) : withSpring(1, POP)
  }, [current, reduceMotion, mark])
  const markStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, mark.value),
    transform: [{ scale: reduceMotion ? 1 : interpolate(mark.value, [0, 1], [0.4, 1]) }],
  }))

  return (
    <View style={[styles.cell, { width: step, paddingTop: top }]}>
      <Pressable accessible={false} onPress={() => onPress(index)}>
        <Animated.View style={[{ width: art, height: art }, card]}>
          <View style={[styles.fill, { borderRadius: radius, boxShadow: SHADOW[scheme] }]}>
            <View style={[styles.fill, styles.clip, { borderRadius: radius }]}>
              <Image source={previewFor(icon, scheme)} style={{ width: art, height: art }} />
              {/* A hairline edge, so a pale icon keeps its shape on a light page and a dark one on a dark page. */}
              <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: radius }]} />
            </View>
          </View>
          <Animated.View style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2, right: inset, bottom: inset }, markStyle]}>
            <Icon name="checkmark" size={Math.round(badge * 0.55)} color={ON_ACCENT} />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  )
}

// The names lie on one another and cross-fade as the strip moves, each drifting a little
// the way its icon goes.
function IconName({ index, title, caption, scrollX, step, drift }: Track & { title: string; caption: string | null; drift: boolean }) {
  const styles = useStyles(createStyles)
  const style = useAnimatedStyle(() => {
    const along = Math.max(-1, Math.min(1, (scrollX.value - index * step) / step))
    return {
      opacity: interpolate(Math.abs(along), [0, 0.55], [1, 0], 'clamp'),
      transform: [{ translateX: drift ? -along * NAME_DRIFT : 0 }],
    }
  })
  return (
    <Animated.View style={[styles.name, style]}>
      <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={TITLE_SCALE}>
        {title}
      </Text>
      {caption ? (
        <Text style={styles.caption} numberOfLines={1} maxFontSizeMultiplier={CAPTION_SCALE}>
          {caption}
        </Text>
      ) : null}
    </Animated.View>
  )
}

function Dot({ index, scrollX, step }: Track) {
  const styles = useStyles(createStyles)
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(scrollX.value - index * step) / step, [0, 1], [1, 0.28], 'clamp'),
  }))
  return <Animated.View style={[styles.dot, style]} />
}

// A soft light in the icon's color behind the strip, passing from one icon's to the next.
function Glow({ index, color, size, scrollX, step }: Track & { color: string; size: number }) {
  const { scheme } = useTheme()
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(scrollX.value - index * step) / step, [0, 1], [1, 0], 'clamp'),
  }))
  const strength = GLOW[scheme]
  const id = `glow-${index}`
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={size} height={size}>
        <Defs>
          {/* The stops fall off like a soft light rather than a straight ramp. */}
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0.3" stopColor={color} stopOpacity={strength} />
            <Stop offset="0.5" stopColor={color} stopOpacity={strength * 0.7} />
            <Stop offset="0.7" stopColor={color} stopOpacity={strength * 0.3} />
            <Stop offset="0.85" stopColor={color} stopOpacity={strength * 0.1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    glow: { position: 'absolute' },
    strip: isWeb ? ({ scrollSnapType: 'x mandatory' } as object) : {},
    cell: { alignItems: 'center', ...(isWeb ? ({ scrollSnapAlign: 'center' } as object) : null) },
    fill: { width: '100%', height: '100%' },
    clip: { overflow: 'hidden', borderCurve: 'continuous' },
    edge: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderCurve: 'continuous' },
    badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderWidth: 2.5, borderColor: colors.bg },
    names: { position: 'absolute', left: 0, right: 0 },
    name: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 32 },
    title: { fontFamily: fonts.prose, fontSize: 30, lineHeight: TITLE_LINE, letterSpacing: -0.3, color: colors.text },
    caption: { fontSize: 15, lineHeight: CAPTION_LINE, marginTop: 2, color: colors.textMuted },
    dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 9 },
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.text },
    footerSpan: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    footer: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingTop: 12 },
  })
