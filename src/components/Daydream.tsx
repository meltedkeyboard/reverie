import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { impactAsync, ImpactFeedbackStyle } from '@/lib/haptics'

// A screen left alone for a while drifts off: its words come loose and float about, and
// slide the way the phone leans. The first touch wakes it, and everything springs back.

// How long the screen waits untouched before it drifts off, and how slowly it goes.
const IDLE_MS = 15000
const DRIFT_IN_MS = 9000
// How far the words slide with the phone leaning all the way.
const TILT_REACH = 60
// The gravity sensor reads in m/s², the lean is kept in g.
const G = 9.81

type Dream = {
  // 0 awake, 1 fully adrift.
  depth: SharedValue<number>
  // Seconds of dreaming, for the words' slow wobble.
  clock: SharedValue<number>
  // How far the phone leans from where it was held when the screen drifted off, in g.
  tiltX: SharedValue<number>
  tiltY: SharedValue<number>
}

const DreamContext = createContext<Dream | null>(null)

// Wraps a screen's content: counts the idle time, and any touch inside it wakes it up.
export function Daydream({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion()
  const depth = useSharedValue(0)
  const clock = useSharedValue(0)
  const tiltX = useSharedValue(0)
  const tiltY = useSharedValue(0)
  const [dreaming, setDreaming] = useState(false)
  const dreamingRef = useRef(false)
  // The screen drifts off once a visit; woken, it stays awake.
  const dreamt = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Read on the UI thread, so the lean is followed every frame rather than as often as
  // the sensor's readings could cross over from JS.
  const gravity = useAnimatedSensor(SensorType.GRAVITY)
  const rest = useSharedValue<{ x: number; y: number } | null>(null)

  const frames = useFrameCallback((frame) => {
    clock.value = frame.timeSinceFirstFrame / 1000
    const { x, y } = gravity.sensor.value
    if (rest.value === null) rest.value = { x, y }
    // Eased towards the reading a little each frame, so the words glide rather than
    // shiver with the hand. The device's y points up the screen, the view's y down it.
    tiltX.value += ((x - rest.value.x) / G - tiltX.value) * 0.08
    tiltY.value += (-(y - rest.value.y) / G - tiltY.value) * 0.08
  }, false)

  const setAdrift = useCallback((on: boolean) => {
    dreamingRef.current = on
    setDreaming(on)
  }, [])

  const driftOff = useCallback(() => {
    dreamt.current = true
    setAdrift(true)
    depth.value = withTiming(1, { duration: DRIFT_IN_MS, easing: Easing.inOut(Easing.sin) })
  }, [depth, setAdrift])

  const wake = useCallback(() => {
    clearTimeout(timer.current)
    if (dreamingRef.current) {
      dreamingRef.current = false
      impactAsync(ImpactFeedbackStyle.Light)
      depth.value = withSpring(0, { damping: 14, stiffness: 140 }, (finished) => {
        if (finished) scheduleOnRN(setAdrift, false)
      })
    }
    if (!reduceMotion && !dreamt.current) timer.current = setTimeout(driftOff, IDLE_MS)
  }, [depth, driftOff, reduceMotion, setAdrift])

  useEffect(() => {
    wake()
    return () => clearTimeout(timer.current)
  }, [wake])

  // The clock and the lean are followed only while the words are adrift; the lean is
  // taken from how the phone is held when the screen drifts off.
  useEffect(() => {
    if (dreaming) rest.value = null
    frames.setActive(dreaming)
    if (!dreaming) {
      tiltX.value = 0
      tiltY.value = 0
    }
  }, [dreaming, frames, rest, tiltX, tiltY])

  return (
    <DreamContext.Provider value={{ depth, clock, tiltX, tiltY }}>
      <View style={style} onTouchStart={wake}>
        {children}
      </View>
    </DreamContext.Provider>
  )
}

// A fixed pseudo-random number in [0, 1) for a seed, so each word keeps its own way of
// drifting from one dream to the next.
function random(seed: number, k: number) {
  const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453
  return s - Math.floor(s)
}

function useDrift(seed: number, reach: number) {
  const dream = useContext(DreamContext)
  const angle = random(seed, 1) * Math.PI * 2
  const far = reach * (0.4 + random(seed, 2) * 0.6)
  const wobble = 4 + random(seed, 3) * 10
  const speed = 0.4 + random(seed, 4) * 0.8
  const phase = random(seed, 5) * Math.PI * 2
  const spin = (random(seed, 6) - 0.5) * 36
  // Some words are heavier and slide further when the phone leans.
  const weight = 0.5 + random(seed, 7)

  return useAnimatedStyle(() => {
    const d = dream ? dream.depth.value : 0
    if (!dream || d === 0) return { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }] }
    const t = dream.clock.value
    const x = Math.cos(angle) * far + Math.sin(t * speed + phase) * wobble + dream.tiltX.value * TILT_REACH * weight
    const y = Math.sin(angle) * far + Math.cos(t * speed * 0.8 + phase) * wobble + dream.tiltY.value * TILT_REACH * weight
    return {
      opacity: 1 - d * 0.45,
      transform: [{ translateX: x * d }, { translateY: y * d }, { rotate: `${d * spin * Math.sin(t * speed * 0.5 + phase)}deg` }],
    }
  })
}

// A block that drifts as one piece, for the wordmark or a heading.
export function DreamyBlock({ seed, children, style }: { seed: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const drift = useDrift(seed, 24)
  return <Animated.View style={[style, drift]}>{children}</Animated.View>
}

// A paragraph whose words come apart and drift each its own way. Laid out as a row of
// words that wrap, so it reads the same as the Text it stands in for; VoiceOver still
// reads it as one piece.
export function DreamyText({ children, seed, style }: { children: string; seed: number; style?: StyleProp<TextStyle> }) {
  const { marginTop, marginBottom, marginHorizontal, textAlign, ...text } = StyleSheet.flatten(style) ?? {}
  const words = children.split(/\s+/).filter(Boolean)
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={children}
      style={[styles.row, textAlign === 'center' && styles.center, { marginTop, marginBottom, marginHorizontal }]}
    >
      {words.map((word, i) => (
        <DreamyWord key={i} seed={seed * 1000 + i} style={text}>
          {word}
        </DreamyWord>
      ))}
    </View>
  )
}

function DreamyWord({ children, seed, style }: { children: string; seed: number; style: TextStyle }) {
  const drift = useDrift(seed, 60)
  return <Animated.Text style={[style, drift]}>{children} </Animated.Text>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  center: { justifyContent: 'center' },
})
