import { Stack, useRouter } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg'

import { Star } from '@/components/motifs/Star'
import { Pattern } from '@/components/Pattern'
import { setOnboardingComplete } from '@/db/onboarding'
import { useDatabase } from '@/db/provider'
import { useShake } from '@/hooks/useShake'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import { APP_VERSION } from '@/lib/version'
import { type Colors, HEADER_ROW_HEIGHT, useColors, useStyles, useTheme } from '@/theme'

// The page from the "About Screen" board in Penpot: the violet circle of the GitHub cover
// sending out a pulse, the confetti drifting around it, and a little chat playing out below,
// with almost no words. Everything moves on one clock that runs from 0 to 1 every CYCLE ms.
const CYCLE = 4800
const HERO = 340
const CIRCLE = 176
const COLUMN = 353

// The poster's colors for the cast, and the confetti: where it sits around the circle's
// center, which way it drifts and how far it turns.
const CAST = { amber: '#F0A35E', sky: '#6CC4E8', pink: '#E779B2' }
const CONFETTI: { kind: 'diamond' | 'square' | 'triangle' | 'ring' | 'dot' | 'burst'; color: string; x: number; y: number; size: number; dx: number; dy: number; spin: number; seed: number }[] = [
  { kind: 'diamond', color: '#F2D46B', x: -132, y: -123, size: 20, dx: 5, dy: -7, spin: 18, seed: 0 },
  { kind: 'square', color: '#6CC4E8', x: 111, y: -164, size: 16, dx: -4, dy: 7, spin: 20, seed: 1.3 },
  { kind: 'triangle', color: '#7FD17F', x: 134, y: -93, size: 26, dx: -6, dy: -5, spin: -14, seed: 2.1 },
  { kind: 'burst', color: '#7FD17F', x: -110, y: -55, size: 16, dx: 7, dy: -4, spin: -25, seed: 3.4 },
  { kind: 'dot', color: '#F0A35E', x: -166, y: 0, size: 10, dx: 4, dy: 8, spin: 0, seed: 4.2 },
  { kind: 'dot', color: '#E779B2', x: 155, y: 0, size: 12, dx: -3, dy: -8, spin: 0, seed: 5 },
  { kind: 'ring', color: '#B99BFF', x: -146, y: 92, size: 20, dx: 6, dy: 6, spin: 0, seed: 0.7 },
  { kind: 'burst', color: '#F2D46B', x: 138, y: 112, size: 22, dx: -5, dy: 7, spin: 30, seed: 2.7 },
]

export default function AboutScreen() {
  const router = useRouter()
  const db = useDatabase()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()

  const restartOnboarding = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    await setOnboardingComplete(db, false)
    router.replace('/onboarding')
  }, [db, router])
  useShake(restartOnboarding, true)

  // With reduced motion the scene stands still at the moment everything is in it.
  const clock = useSharedValue(0.8)
  useEffect(() => {
    if (reduceMotion) return
    clock.value = 0
    clock.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1)
    return () => cancelAnimation(clock)
  }, [clock, reduceMotion])

  // A narrow phone gets the whole picture a little smaller rather than cut.
  const scale = Math.min(1, (width - 32) / COLUMN)

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, headerTransparent: true, headerShadowVisible: false, headerTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <Pattern id="stars" />
      <View style={[styles.body, { paddingTop: insets.top + HEADER_ROW_HEIGHT - 24, paddingBottom: insets.bottom + 16 }]}>
        <View style={{ transform: [{ scale }] }} accessible accessibilityLabel={t('about.tagline')}>
          <Hero clock={clock} />
        </View>
        <Text style={styles.version}>{t('about.version', { version: APP_VERSION })}</Text>
        <View style={[styles.scene, { transform: [{ scale }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ChatScene clock={clock} />
        </View>
        <View accessible accessibilityLabel={t('about.shakeHint')}>
          <ShakeMark />
        </View>
      </View>
    </View>
  )
}

function Hero({ clock }: { clock: SharedValue<number> }) {
  const colors = useColors()
  const { scheme } = useTheme()
  const styles = useStyles(createStyles)

  // Two pulses a cycle: a ring leaves the circle, grows to the outer orbit and fades.
  const pulse = useAnimatedStyle(() => {
    const p = (clock.value * 2) % 1
    return { opacity: 0.6 * (1 - p), transform: [{ scale: interpolate(p, [0, 1], [1, HERO / CIRCLE]) }] }
  })
  const breathe = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.025 * Math.sin(clock.value * Math.PI * 4) }] }))

  return (
    <View style={styles.hero}>
      <Svg width={HERO + 80} height={HERO + 80} style={styles.glow}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0.3" stopColor={colors.accent} stopOpacity={scheme === 'dark' ? 0.45 : 0.3} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
      {[
        [HERO, 0.1],
        [272, 0.18],
        [210, 0.3],
      ].map(([size, opacity]) => (
        <View key={size} style={[styles.ring, { width: size, height: size, borderRadius: size / 2, opacity }]} />
      ))}
      <Animated.View style={[styles.ring, styles.pulse, pulse]} />
      <Animated.View style={[styles.circle, breathe]}>
        <Star size={112} color="#FFFFFF" />
      </Animated.View>
      {CONFETTI.map((piece, i) => (
        <Confetti key={i} piece={piece} clock={clock} />
      ))}
    </View>
  )
}

// One of the shapes around the circle, swaying on its own phase.
function Confetti({ piece, clock }: { piece: (typeof CONFETTI)[number]; clock: SharedValue<number> }) {
  const { kind, color, x, y, size, dx, dy, spin, seed } = piece
  const style = useAnimatedStyle(() => {
    const s = Math.sin(clock.value * Math.PI * 2 + seed)
    return { transform: [{ translateX: dx * s }, { translateY: dy * s }, { rotate: `${spin * s}deg` }] }
  })
  const box = { position: 'absolute' as const, left: HERO / 2 + x - size / 2, top: HERO / 2 + y - size / 2, width: size, height: size }
  return (
    <Animated.View style={[box, style]}>
      {kind === 'burst' ? (
        <Star size={size} color={color} />
      ) : (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {kind === 'diamond' ? <Rect x="5" y="5" width="14" height="14" rx="3.5" transform="rotate(45 12 12)" stroke={color} strokeWidth="2.5" fill="none" /> : null}
          {kind === 'square' ? <Rect x="2" y="2" width="20" height="20" rx="5" stroke={color} strokeWidth="3" fill="none" /> : null}
          {kind === 'triangle' ? <Path d="M12 3L22 20H2Z" stroke={color} strokeWidth="2.2" strokeLinejoin="round" fill="none" /> : null}
          {kind === 'ring' ? <Circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="3" fill="none" /> : null}
          {kind === 'dot' ? <Circle cx="12" cy="12" r="12" fill={color} /> : null}
        </Svg>
      )}
    </Animated.View>
  )
}

// What a cycle of the chat looks like, as parts of the clock: the sky reply arrives, I type
// in the field, and my message leaves it for its place above; then it all clears for the next round.
const SKY_IN = [0.12, 0.2]
const TYPING = [0.3, 0.58]
const SENT = [0.62, 0.74]
const CLEAR = [0.92, 1]
// Where my bubble appears before it settles: a little off its place, and turned.
const LAND_X = 10
const LAND_Y = 12
const LAND_TURN = 9

function ChatScene({ clock }: { clock: SharedValue<number> }) {
  const styles = useStyles(createStyles)
  // Called from the animated styles, so it has to run on the UI thread too.
  const clear = (t: number) => {
    'worklet'
    return interpolate(t, CLEAR, [1, 0], Extrapolation.CLAMP)
  }

  const sky = useAnimatedStyle(() => {
    const t = clock.value
    const shown = interpolate(t, SKY_IN, [0, 1], Extrapolation.CLAMP)
    return { opacity: shown * clear(t), transform: [{ translateY: (1 - shown) * 10 }] }
  })
  const mine = useAnimatedStyle(() => {
    const t = clock.value
    const sent = interpolate(t, SENT, [0, 1], Extrapolation.CLAMP)
    // It shows up right by its place, tilted, and lies down straight as it fades in.
    const settle = 1 - Math.pow(1 - sent, 3)
    return {
      opacity: settle * clear(t),
      transform: [
        { translateX: (1 - settle) * LAND_X },
        { translateY: (1 - settle) * LAND_Y },
        { rotate: `${(1 - settle) * LAND_TURN}deg` },
      ],
    }
  })
  const typed = useAnimatedStyle(() => {
    const t = clock.value
    const grown = interpolate(t, TYPING, [0, 1], Extrapolation.CLAMP)
    return { width: 8 + 168 * grown, opacity: t < SENT[0] && t > TYPING[0] ? 1 : 0 }
  })
  const placeholder = useAnimatedStyle(() => {
    const t = clock.value
    return { opacity: t > TYPING[0] && t < SENT[0] ? 0 : 1 }
  })

  return (
    <View style={styles.sceneInner}>
      <Line color={CAST.amber} side="left" widths={[140, 88]} />
      <Animated.View style={sky}>
        <Line color={CAST.sky} side="right" widths={[128, 72]} />
      </Animated.View>
      <View style={styles.lastRow}>
        <View style={[styles.avatar, { backgroundColor: CAST.pink }]} />
        <Typing clock={clock} />
        <View style={styles.flex} />
        <Animated.View style={[styles.mine, mine]}>
          <View style={[styles.bar, styles.mineBar, { width: 118 }]} />
          <View style={[styles.bar, styles.mineBar, { width: 76, opacity: 0.6 }]} />
        </Animated.View>
      </View>
      <Composer typed={typed} placeholder={placeholder} />
    </View>
  )
}

// A character's line: the avatar, then the bubble with a name in their color and two lines.
function Line({ color, side, widths }: { color: string; side: 'left' | 'right'; widths: [number, number] }) {
  const styles = useStyles(createStyles)
  const avatar = <View style={[styles.avatar, { backgroundColor: color }]} />
  return (
    <View style={[styles.row, side === 'right' && styles.rowRight]}>
      {side === 'left' ? avatar : null}
      <View style={styles.bubble}>
        <View style={[styles.name, { backgroundColor: color }]} />
        <View style={[styles.bar, styles.textBar, { width: widths[0] }]} />
        <View style={[styles.bar, styles.textBar, { width: widths[1], opacity: 0.6 }]} />
      </View>
      {side === 'right' ? avatar : null}
    </View>
  )
}

// Three dots, one lit at a time, walking left to right.
function Typing({ clock }: { clock: SharedValue<number> }) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.typing}>
      {[0, 1, 2].map((i) => (
        <TypingDot key={i} index={i} clock={clock} />
      ))}
    </View>
  )
}

function TypingDot({ index, clock }: { index: number; clock: SharedValue<number> }) {
  const styles = useStyles(createStyles)
  const style = useAnimatedStyle(() => {
    // Eight steps a cycle; how near the lit step is to this dot.
    const step = (clock.value * 8) % 3
    const near = Math.max(0, 1 - Math.abs(step - index))
    return { opacity: 0.3 + 0.7 * near, transform: [{ translateY: -2 * near }] }
  })
  return <Animated.View style={[styles.dot, style]} />
}

function Composer({ typed, placeholder }: { typed: object; placeholder: object }) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  return (
    <View style={styles.composer}>
      <View style={styles.attach}>
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Path d="M7 1.5V12.5M1.5 7H12.5" stroke={colors.text} strokeOpacity={0.7} strokeWidth={2.4} strokeLinecap="round" />
        </Svg>
      </View>
      <View style={styles.field}>
        <Animated.View style={[styles.bar, styles.placeholder, placeholder]} />
        <Animated.View style={[styles.bar, styles.typed, typed]} />
      </View>
      <View style={styles.send}>
        <Svg width={16} height={16} viewBox="0 0 16 16">
          <Path d="M8 13.5V2.5M3 7.5L8 2.5L13 7.5" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </View>
    </View>
  )
}

// Shaking the phone starts onboarding again: a tilted phone between motion strokes.
function ShakeMark() {
  const colors = useColors()
  return (
    <Svg width={48} height={28} viewBox="0 0 48 28" style={{ alignSelf: 'center', opacity: 0.4 }}>
      <Rect x="17" y="3" width="14" height="22" rx="3.5" stroke={colors.text} strokeWidth={1.5} fill="none" transform="rotate(-14 24 14)" />
      <Path d="M9 9V19M4 11V17M39 9V19M44 11V17" stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  )
}

const createStyles = (colors: Colors) => {
  // The poster's darker bubbles belong to the dark palette only; the light one has white ones.
  const dark = colors.bg === '#0F0F12'
  const bubble = dark ? '#2A2A32' : '#FFFFFF'
  const ink = dark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.3)'
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    body: { flex: 1, alignItems: 'center', justifyContent: 'space-between' },
    hero: { width: HERO, height: HERO, alignItems: 'center', justifyContent: 'center' },
    glow: { position: 'absolute', left: -40, top: -40 },
    ring: { position: 'absolute', borderWidth: 1.5, borderColor: colors.accent },
    pulse: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, borderWidth: 2.5 },
    circle: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: CIRCLE / 2,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    version: { color: colors.textFaint, fontSize: 13 },
    scene: { width: COLUMN },
    sceneInner: { gap: 22 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowRight: { justifyContent: 'flex-end' },
    lastRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    flex: { flex: 1 },
    avatar: { width: 30, height: 30, borderRadius: 15 },
    bubble: {
      width: 178,
      borderRadius: 18,
      borderCurve: 'continuous',
      backgroundColor: bubble,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 6,
    },
    name: { width: 38, height: 7, borderRadius: 3.5, opacity: 0.9, marginBottom: 1 },
    bar: { height: 6, borderRadius: 3 },
    textBar: { backgroundColor: ink },
    mine: {
      width: 162,
      borderRadius: 18,
      borderCurve: 'continuous',
      backgroundColor: colors.accent,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 6,
    },
    mineBar: { backgroundColor: '#FFFFFF' },
    typing: {
      flexDirection: 'row',
      gap: 7,
      paddingHorizontal: 14,
      height: 30,
      alignItems: 'center',
      borderRadius: 15,
      backgroundColor: bubble,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CAST.pink },
    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 54,
      borderRadius: 27,
      paddingHorizontal: 7,
      gap: 12,
      backgroundColor: dark ? colors.surface : '#FFFFFF',
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    attach: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#2A2A32' : colors.surfaceRaised },
    field: { flex: 1, height: 8, justifyContent: 'center' },
    placeholder: { position: 'absolute', width: 150, backgroundColor: dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.18)' },
    typed: { position: 'absolute', backgroundColor: dark ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.6)' },
    send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  })
}
