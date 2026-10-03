import { useEffect, useState, useSyncExternalStore } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { GlassSurface, useGlassStyles } from './Glass'
import { dismissToast, getToast, subscribeToast } from '@/lib/toast'
import { fonts, HEADER_ROW_HEIGHT, useColors, useStyles, type Colors } from '@/theme'

const SWIPE_AWAY = 28
// Past the top edge by the card's own height, its distance from the edge and its shadow.
const SHADOW_ROOM = 24

// Draws the toast from lib/toast over the screen, just under the header: it drops in from
// above on a spring, and goes back up by itself, on a tap or on a swipe upwards. The last one stays
// drawn while it leaves.
export function ToastHost() {
  const colors = useColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const top = insets.top + HEADER_ROW_HEIGHT + 8
  const current = useSyncExternalStore(subscribeToast, getToast)
  const [kept, setKept] = useState(current)
  if (current && current !== kept) setKept(current)

  // Starts above the screen; the real height replaces the guess once it is measured.
  const height = useSharedValue(200)
  const offset = useSharedValue(-400)
  useEffect(() => {
    if (current) offset.value = withSpring(0, { damping: 18, stiffness: 190, mass: 0.9 })
    else offset.value = withTiming(-(height.value + top + SHADOW_ROOM), { duration: 220, easing: Easing.in(Easing.cubic) })
  }, [current, offset, height, top])

  const drag = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((e) => {
      offset.value = Math.min(0, e.translationY)
    })
    .onEnd((e) => {
      if (e.translationY < -SWIPE_AWAY || e.velocityY < -600) scheduleOnRN(dismissToast)
      else offset.value = withSpring(0, { damping: 18, stiffness: 190 })
    })

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))
  const measure = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height
  }

  if (!kept) return null
  const failed = kept.tone === 'error'

  return (
    <View style={[styles.layer, { paddingTop: top }]} pointerEvents="box-none">
      <GestureDetector gesture={drag}>
        <Animated.View style={[styles.slide, slide]} onLayout={measure} pointerEvents={current ? 'auto' : 'none'}>
          <GlassSurface style={styles.card} fallbackStyle={[glass.solid, failed && styles.failedBorder]}>
            {failed ? <View style={styles.failedTint} pointerEvents="none" /> : null}
            <Pressable onPress={dismissToast} style={styles.body} accessibilityRole="alert">
              <View style={styles.text}>
                <Text style={styles.title}>{kept.title}</Text>
                {kept.message ? <Text style={styles.message}>{kept.message}</Text> : null}
              </View>
            </Pressable>
            {kept.actions?.length ? (
              <View style={styles.actions}>
                {kept.actions.map((action) => (
                  <Pressable
                    key={action.label}
                    hitSlop={6}
                    onPress={() => {
                      dismissToast()
                      action.onPress()
                    }}
                    style={({ pressed }) => pressed && { opacity: 0.6 }}
                  >
                    <Text style={[styles.action, { color: action.destructive ? colors.danger : colors.accent }]}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </GlassSurface>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    // Above the dialogs' layer (1000) and the sidebar: on the web the stacking is by zIndex, not by order.
    layer: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, zIndex: 2000 },
    // The shadow belongs to the box the card fills, so the width limit and the radius are here.
    slide: Platform.select({
      web: { boxShadow: '0 6px 16px rgba(0, 0, 0, 0.18)', borderRadius: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
      default: { width: '100%', maxWidth: 560, alignSelf: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
    }),
    card: { borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 },
    body: {},
    // A failure is the same glass with a red cast.
    failedTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 24, backgroundColor: colors.dangerSoft },
    failedBorder: { borderColor: colors.dangerBorder },
    text: { flex: 1, gap: 2 },
    title: { color: colors.text, fontFamily: fonts.prose, fontSize: 16, fontWeight: '600' },
    message: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 22, marginTop: 10 },
    action: { fontSize: 15, fontWeight: '600' },
  })
