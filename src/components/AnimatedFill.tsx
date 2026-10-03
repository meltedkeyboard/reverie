import { useLayoutEffect, useRef } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

type Props = {
  // The height of the card that fills the screen, or undefined for a card of its own height.
  fillHeight?: number
  children: React.ReactNode
}

// What a row is tall before it has been measured.
const ROW = 88
const TIMING = { duration: 420, easing: Easing.out(Easing.cubic) }

// Wraps a home card so that the change between the row and the card over the whole screen
// is a growth, not a jump: the wrapper's height runs between the two while the card inside
// has its final size and is clipped by it. A row keeps its own height (auto, -1 here), which
// is measured to know where a growth starts and where a shrink ends.
export function AnimatedFill({ fillHeight, children }: Props) {
  const height = useSharedValue(fillHeight ?? -1)
  const before = useRef(fillHeight)
  const row = useRef(ROW)

  // Layout effect: the height has to be set before the new size is first painted.
  useLayoutEffect(() => {
    const was = before.current
    before.current = fillHeight
    if (was === fillHeight) return
    if (fillHeight !== undefined) {
      if (was === undefined) height.value = row.current
      height.value = withTiming(fillHeight, TIMING)
    } else {
      height.value = withTiming(row.current, TIMING, (done) => {
        if (done) height.value = -1
      })
    }
  }, [fillHeight, height])

  const style = useAnimatedStyle(() =>
    height.value < 0 ? {} : { height: height.value, overflow: 'hidden', borderRadius: 20, borderCurve: 'continuous' }
  )

  const onLayout = (e: LayoutChangeEvent) => {
    if (before.current === undefined) row.current = e.nativeEvent.layout.height
  }

  return (
    <Animated.View style={style} onLayout={onLayout}>
      {children}
    </Animated.View>
  )
}
