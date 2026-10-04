import { Image } from 'expo-image'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import { StyleSheet, View, useColorScheme } from 'react-native'
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FILL } from '@/theme'

import { Wordmark } from './Wordmark'

// Kept up until the overlay below has taken its place, so there is no blank frame between.
SplashScreen.preventAutoHideAsync().catch(() => {})

// The size the native splash draws the icon at (imageWidth in app.json).
const ICON = 120
// backgroundColor and dark.backgroundColor of expo-splash-screen in app.json.
const BACKGROUNDS = { light: '#F5F5F7', dark: '#0F0F12' }
const ICONS = {
  light: require('../../assets/images/splash-icon.png'),
  dark: require('../../assets/images/splash-icon-dark.png'),
}

// The launch screen in the manner of Meta's apps: the icon in the middle, as the native
// splash has it, and the wordmark small at the bottom. The native splash can only hold one
// centered picture, so this takes over from it pixel for pixel, brings in the wordmark,
// holds a moment and fades away over the app.
export function SplashOverlay() {
  // The native splash follows the system's look, not the theme picked in the app, and so
  // must the overlay that takes its place.
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark'
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const [done, setDone] = useState(false)
  const mark = useSharedValue(0)
  const fade = useSharedValue(1)

  // Shown is when the icon is on screen. Only then does the native splash go, a frame later
  // still, so it never leaves an empty background or the app showing for a frame. If the
  // picture somehow never reports, the splash goes anyway.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const fallback = setTimeout(() => setShown(true), 1000)
    return () => clearTimeout(fallback)
  }, [])
  useEffect(() => {
    if (!shown) return
    const frame = requestAnimationFrame(() => SplashScreen.hideAsync().catch(() => {}))
    const ease = { duration: 200, easing: Easing.out(Easing.cubic) }
    mark.value = withTiming(1, ease)
    fade.value = withDelay(
      350,
      withSequence(
        withTiming(0, { duration: reduceMotion ? 150 : 200, easing: Easing.out(Easing.quad) }, (finished) => {
          if (finished) runOnJS(setDone)(true)
        })
      )
    )
    return () => cancelAnimationFrame(frame)
  }, [shown, fade, mark, reduceMotion])

  const screen = useAnimatedStyle(() => ({ opacity: fade.value }))
  // The icon leans in a touch as it goes, like the app opening out of it.
  const icon = useAnimatedStyle(() => (reduceMotion ? {} : { transform: [{ scale: 1 + (1 - fade.value) * 0.12 }] }))
  const wordmark = useAnimatedStyle(() => ({ opacity: mark.value, transform: [{ translateY: (1 - mark.value) * 6 }] }))

  if (done) return null
  return (
    <Animated.View pointerEvents="none" style={[styles.screen, { backgroundColor: BACKGROUNDS[scheme] }, screen]}>
      <Animated.View style={icon}>
        <Image source={ICONS[scheme]} style={styles.icon} contentFit="contain" onDisplay={() => setShown(true)} />
      </Animated.View>
      <View style={[styles.bottom, { bottom: insets.bottom + 28 }]}>
        <Animated.View style={wordmark}>
          <Wordmark width={92} optical />
        </Animated.View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: { ...FILL, zIndex: 1000, elevation: 1000, alignItems: 'center', justifyContent: 'center' },
  icon: { width: ICON, height: ICON },
  bottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
})
