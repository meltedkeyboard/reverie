import { useEffect, useRef, type ComponentRef } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import * as Haptics from '@/lib/ui/haptics'
import { useStyles, useTheme, type Colors } from '@/theme'

const MAX_BAR = 22
const MIN_BAR = 6
const HIT_HEIGHT = 28
const BAR_HEIGHT = 3
const ACTIVE_HEIGHT = 4.5

type Props = {
  count: number
  index: number
  maxWidth: number
  progress: SharedValue<number>
  onSelect: (index: number) => void
}

function clamp(v: number, min: number, max: number) {
  'worklet'
  return v < min ? min : v > max ? max : v
}

// Even horizontal bars along the bottom of the viewer: a bright indicator stretches between
// adjacent bars with the finger's drag before settling onto the active one.
export function ViewerStrip({ count, index, maxWidth, progress, onSelect }: Props) {
  const styles = useStyles(createStyles)
  const { scheme } = useTheme()
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const firstCenter = useRef(true)
  const inactiveColor = scheme === 'dark' ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.22)'
  const activeShadowOpacity = scheme === 'dark' ? 0.45 : 0.18

  const gap = count <= 10 ? 5 : count <= 20 ? 4 : 2.5
  const idealBar = (maxWidth - gap * Math.max(0, count - 1)) / Math.max(1, count)
  const barWidth = clamp(idealBar, MIN_BAR, MAX_BAR)
  const step = barWidth + gap
  const totalWidth = count * barWidth + Math.max(0, count - 1) * gap
  const scrollable = totalWidth > maxWidth
  const viewportWidth = Math.min(totalWidth, maxWidth)

  useEffect(() => {
    if (!scrollable || viewportWidth <= 0) return
    const activeCenter = index * step + barWidth / 2
    const target = Math.max(0, Math.min(totalWidth - viewportWidth, activeCenter - viewportWidth / 2))
    const animated = !firstCenter.current
    firstCenter.current = false
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: target, animated })
    })
    return () => cancelAnimationFrame(frame)
  }, [index, scrollable, viewportWidth, totalWidth, step, barWidth])

  // Bridge from `low` to `high` in the first half of a swipe, then pull the tail in.
  const wormStyle = useAnimatedStyle(() => {
    const pos = clamp(progress.value, 0, Math.max(0, count - 1))
    const low = Math.floor(pos)
    const high = Math.min(Math.max(0, count - 1), low + 1)
    const frac = pos - low
    const head = frac <= 0.5 ? low + frac * 2 * (high - low) : high
    const tail = frac <= 0.5 ? low : low + (frac - 0.5) * 2 * (high - low)
    return {
      left: tail * step,
      width: (head - tail) * step + barWidth,
    }
  }, [count, step, barWidth])

  const row = (
    <View style={[styles.track, { width: totalWidth, gap }]}>
      {Array.from({ length: count }, (_, i) => (
        <Pressable
          key={i}
          onPress={() => {
            if (i === index) return
            Haptics.selectionAsync()
            onSelect(i)
          }}
          hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
          accessibilityRole="button"
          accessibilityState={{ selected: i === index }}
          accessibilityLabel={`${i + 1} / ${count}`}
          style={[styles.barHit, { width: barWidth }]}
        >
          <View style={[styles.bar, { width: barWidth, backgroundColor: inactiveColor }]} />
        </Pressable>
      ))}
      <Animated.View
        style={[styles.activeBar, { shadowOpacity: activeShadowOpacity }, wormStyle]}
        pointerEvents="none"
      />
    </View>
  )

  if (!scrollable) return row

  return (
    <View style={{ width: viewportWidth, height: HIT_HEIGHT }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {row}
      </ScrollView>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    track: {
      height: HIT_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
    },
    scrollContent: {
      alignItems: 'center',
    },
    barHit: {
      height: HIT_HEIGHT,
      justifyContent: 'center',
    },
    bar: {
      height: BAR_HEIGHT,
      borderRadius: BAR_HEIGHT / 2,
    },
    activeBar: {
      position: 'absolute',
      top: (HIT_HEIGHT - ACTIVE_HEIGHT) / 2,
      height: ACTIVE_HEIGHT,
      borderRadius: ACTIVE_HEIGHT / 2,
      backgroundColor: colors.text,
      shadowColor: '#000',
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
  })
