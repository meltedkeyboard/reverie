import { useEffect, useRef, useState, type ReactNode } from 'react'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'

const OUT_MS = 140
const IN_MS = 260
const HOLD_MS = 240
const SHIFT = 8

const LAP_MS = OUT_MS + IN_MS + HOLD_MS + 60

export function useAtLeastOneLap(active: boolean) {
  const [held, setHeld] = useState(false)
  const startedAt = useRef(0)
  useEffect(() => {
    if (active) {
      startedAt.current = Date.now()
      setHeld(true)
      return
    }
    const timer = setTimeout(() => setHeld(false), Math.max(0, startedAt.current + LAP_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [active])
  return active || held
}

export function SlidingIcon({ direction, active, children }: { direction?: 'up' | 'down'; active: boolean; children: ReactNode }) {
  const fade = useSharedValue(1)
  const shift = useSharedValue(0)
  const away = direction === 'down' ? SHIFT : -SHIFT

  useEffect(() => {
    const ease = { duration: IN_MS, easing: Easing.out(Easing.cubic) }
    if (!active) {
      fade.value = withTiming(1, ease)
      shift.value = withTiming(0, ease)
      return
    }
    fade.value = withRepeat(
      withSequence(withTiming(0, { duration: OUT_MS }), withTiming(0, { duration: 0 }), withTiming(1, ease), withTiming(1, { duration: HOLD_MS })),
      -1,
    )
    shift.value = withRepeat(
      withSequence(withTiming(away, { duration: OUT_MS }), withTiming(-away, { duration: 0 }), withTiming(0, ease), withTiming(0, { duration: HOLD_MS })),
      -1,
    )
  }, [active, away, fade, shift])

  const style = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateY: shift.value }] }))
  return <Animated.View style={style}>{children}</Animated.View>
}
