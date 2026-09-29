import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Keyboard, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  interpolate,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'

import { selectionAsync } from '@/lib/haptics'
import { useStyles, type Colors } from '@/theme'

import { useHeaderHeight } from './GlassHeader'

export type WheelItem = {
  key: string
  // The search sections the card holds, so a search result can turn the wheel to it.
  sections: string[]
  content: ReactNode
}

type Props = {
  items: WheelItem[]
  // Turns the wheel to the card holding this section; `n` tells two jumps to it apart.
  focus?: { section: string; n: number } | null
}

// The radius of the drum's curve at the top and the bottom of the screen, where the cards
// roll away. Between the two curves the drum is flat.
const CURL = 120
const GAP = 14
// Past this distance from the middle a card is as dim as it gets.
const FADE_DISTANCE = 90
const DIM = 0.3
// How much narrower a card gets as it rolls away out of sight.
const NARROW = 0.08

// The cards are laid out this many times in a row, and the wheel is kept in the middle
// run. Three runs either way leave room for a few hard flings in a row before it stops.
const COPIES = 10
const MIDDLE_RUN = Math.floor(COPIES / 2)
// How long after a drag or a turn the wheel is taken as stopped, if no momentum follows.
const SETTLE_MS = 400

// Called from the UI thread; a worklet cannot take the Keyboard object itself along.
function dismissKeyboard() {
  if (Keyboard.isVisible()) Keyboard.dismiss()
}

// Which of the cards has its middle nearest to `at`.
function nearest(centers: number[], at: number) {
  'worklet'
  let best = 0
  for (let i = 1; i < centers.length; i++) {
    if (Math.abs(centers[i] - at) < Math.abs(centers[best] - at)) best = i
  }
  return best
}

// Where a point `u` from the middle of the screen is drawn: as it is within `flat` of the
// middle, then along a quarter circle of radius CURL that rolls it out of sight. The
// mapping only ever grows, so cards squeezed by it can never overlap.
function project(u: number, flat: number) {
  'worklet'
  const a = Math.abs(u)
  if (a <= flat) return u
  const along = Math.min(a - flat, (CURL * Math.PI) / 2)
  return Math.sign(u) * (flat + CURL * Math.sin(along / CURL))
}

// Settings as cards on a drum, like the wheel of a picker: the middle of the screen is
// flat and the cards there are as they are, while towards the header and the tab bar
// they roll away over the drum's edge, squeezed and dimmed. Only the card in the middle
// is lit and can be used. The wheel stops with a card in the middle and ticks as each one
// passes. A card too tall for the flat part stops twice, once showing its top and once
// its bottom. Tapping a dim card turns it to the middle.
//
// The wheel goes round: after the last card comes the first again. The cards are there
// several times over, and whenever the wheel stops, or is caught by a finger, outside the
// middle run it is moved by whole runs to the same card in the middle one. The runs look
// the same, so nothing seems to happen, and the wheel never gets to an end.
export function SettingsWheel({ items, focus }: Props) {
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollY = useSharedValue(0)
  const middle = useSharedValue(0)
  const flatHalf = useSharedValue(0)
  const centers = useSharedValue<number[]>([])
  const count = useSharedValue(items.length)
  const dragging = useSharedValue(false)
  const coasting = useSharedValue(false)

  const [viewport, setViewport] = useState(0)
  const [layouts, setLayouts] = useState<Record<string, { y: number; h: number }>>({})
  const n = items.length
  const [current, setCurrent] = useState(MIDDLE_RUN * n)
  const currentRef = useRef(-1)
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const cards = Array.from({ length: COPIES }, (_, copy) =>
    items.map((item, i) => ({ item, key: `${copy}:${item.key}`, index: copy * n + i }))
  ).flat()

  // The part of the screen between the header and the tab bar, in the scroll view's terms.
  const top = headerHeight
  const bottom = viewport - insets.bottom
  const band = bottom - top
  const mid = top + band / 2
  // Half the flat part of the drum; the curls take the rest of the band.
  const flat = Math.max(0, band / 2 - CURL)

  const measured = cards.every((card) => layouts[card.key])
  const first = layouts[cards[0]?.key]
  const last = layouts[cards[cards.length - 1]?.key]
  // Enough room at both ends for the first and the last card to reach the middle.
  const padTop = Math.max(0, mid - (first?.h ?? 0) / 2)
  const padBottom = Math.max(0, viewport - mid - (last?.h ?? 0) / 2)

  // Where the wheel stops for each card: its middle in the middle, or, if it does not fit
  // in the flat part, its top and then its bottom at the ends of it.
  const ready = measured && viewport > 0
  const stops = ready
    ? cards.map((card) => {
        const { y, h } = layouts[card.key]
        if (h <= 2 * flat) return [y + h / 2 - mid]
        return [y - (mid - flat), y + h - (mid + flat)]
      })
    : []
  // The same array while the stops stay, so a tick of the wheel does not send it to the
  // native scroll view again.
  const snapKey = stops.flat().map((y) => Math.max(0, y)).join()
  const snapOffsets = useMemo(() => (snapKey ? snapKey.split(',').map(Number) : undefined), [snapKey])
  const centersKey = ready ? cards.map((card) => layouts[card.key].y + layouts[card.key].h / 2).join() : ''

  useEffect(() => {
    middle.value = mid
    flatHalf.value = flat
  }, [middle, mid, flatHalf, flat])

  useEffect(() => {
    count.value = n
  }, [count, n])

  useEffect(() => {
    if (centersKey) centers.value = centersKey.split(',').map(Number)
  }, [centers, centersKey])

  // Moves the wheel by whole runs back into the middle one, where it can go either way.
  // A field being typed in would be left behind in the other run, so the keyboard goes.
  const recenter = () => {
    'worklet'
    const list = centers.value
    const per = count.value
    if (per === 0 || list.length < COPIES * per) return
    const copy = Math.floor(nearest(list, scrollY.value + middle.value) / per)
    if (copy === MIDDLE_RUN) return
    const run = list[per] - list[0]
    const y = scrollY.value - (copy - MIDDLE_RUN) * run
    scrollTo(scrollRef, 0, y, false)
    // Right away, not with the next scroll event, so the cards are not drawn for a frame
    // as if the wheel were still where it was.
    scrollY.value = y
    scheduleOnRN(dismissKeyboard)
  }

  // A release without a fling, or a turn by code, sends no momentum events; the wheel
  // is taken as stopped a moment later if nothing moves it by then.
  const settleLater = () => {
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      scheduleOnUI(() => {
        'worklet'
        if (!dragging.value && !coasting.value) recenter()
      })
    }, SETTLE_MS)
  }

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  const turnTo = (index: number, animated = true) => {
    const y = stops[index]?.[0]
    if (y === undefined) return
    scheduleOnUI(() => {
      'worklet'
      scrollTo(scrollRef, 0, Math.max(0, y), animated)
    })
    if (animated) settleLater()
  }

  // Opens on the first card of the middle run. It looks just like the one in the first
  // run the wheel shows before this, so the jump is not seen.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || stops.length === 0) return
    started.current = true
    turnTo(MIDDLE_RUN * n, false)
  })

  // The same card is there in every run; the wheel turns to the nearest one.
  useEffect(() => {
    if (!focus || stops.length === 0) return
    const i = items.findIndex((item) => item.sections.includes(focus.section))
    if (i < 0) return
    const from = currentRef.current < 0 ? MIDDLE_RUN * n : currentRef.current
    const candidates = Array.from({ length: COPIES }, (_, copy) => copy * n + i)
    turnTo(candidates.reduce((a, b) => (Math.abs(b - from) < Math.abs(a - from) ? b : a)))
    // Only a new jump turns the wheel, not the cards changing size afterwards.
  }, [focus, stops.length > 0])

  const onCurrent = (index: number) => {
    const previous = currentRef.current
    currentRef.current = index
    setCurrent(index)
    // No tick on opening, nor when the wheel is moved to the same card in another run.
    if (previous >= 0 && previous % n !== index % n) selectionAsync()
  }

  useAnimatedReaction(
    () => (centers.value.length === 0 ? -1 : nearest(centers.value, scrollY.value + middle.value)),
    (index, previous) => {
      if (index >= 0 && index !== previous) scheduleOnRN(onCurrent, index)
    }
  )

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
    },
    // A finger catching the spinning wheel stops it, which is a moment to move it back
    // to the middle run before it can be flung on towards an end.
    onBeginDrag: () => {
      dragging.value = true
      coasting.value = false
      recenter()
    },
    onEndDrag: () => {
      dragging.value = false
      scheduleOnRN(settleLater)
    },
    onMomentumBegin: () => {
      coasting.value = true
    },
    onMomentumEnd: () => {
      coasting.value = false
      recenter()
    },
  })

  // Stable callbacks, so a tick of the wheel re-renders only the two cards whose light
  // changes and not every card of every run.
  const onItemLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout
    setLayouts((prev) => (prev[key]?.y === y && prev[key]?.h === height ? prev : { ...prev, [key]: { y, h: height } }))
  }, [])
  const turnToRef = useRef(turnTo)
  turnToRef.current = turnTo
  const onCardPress = useCallback((index: number) => turnToRef.current(index), [])

  return (
    <Animated.ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
      snapToOffsets={snapOffsets}
      // The wheel keeps the speed it was flung with and slows down on its own, then
      // settles on the nearest card.
      decelerationRate="normal"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: padTop, paddingBottom: padBottom }]}
    >
      {cards.map((card) => (
        <WheelCard
          key={card.key}
          cardKey={card.key}
          index={card.index}
          scrollY={scrollY}
          middle={middle}
          flatHalf={flatHalf}
          layout={layouts[card.key]}
          lit={card.index === current}
          onCardLayout={onItemLayout}
          onCardPress={onCardPress}
        >
          {card.item.content}
        </WheelCard>
      ))}
    </Animated.ScrollView>
  )
}

type CardProps = {
  cardKey: string
  index: number
  scrollY: SharedValue<number>
  middle: SharedValue<number>
  flatHalf: SharedValue<number>
  layout?: { y: number; h: number }
  lit: boolean
  onCardLayout: (key: string, e: LayoutChangeEvent) => void
  onCardPress: (index: number) => void
  children: ReactNode
}

const WheelCard = memo(function WheelCard({
  cardKey,
  index,
  scrollY,
  middle,
  flatHalf,
  layout,
  lit,
  onCardLayout,
  onCardPress,
  children,
}: CardProps) {
  const styles = useStyles(createStyles)
  const y = layout?.y ?? 0
  const h = layout?.h ?? 0

  // The card's top and bottom are each put where the drum draws them, and the card is
  // squeezed to fit between; it scales about its middle, hence the shift.
  const style = useAnimatedStyle(() => {
    const from = y - (scrollY.value + middle.value)
    const drawnTop = project(from, flatHalf.value)
    const drawnBottom = project(from + h, flatHalf.value)
    const squeeze = h > 0 ? (drawnBottom - drawnTop) / h : 1
    return {
      // A card rolled all the way over the edge is a line; better not drawn at all.
      opacity: squeeze < 0.03 ? 0 : 1,
      transform: [
        { translateY: (drawnTop + drawnBottom) / 2 - (from + h / 2) },
        { scaleX: 1 - NARROW * (1 - squeeze) },
        { scaleY: Math.max(squeeze, 0.001) },
      ],
    }
  })

  // The card dims under a veil of the page's color rather than by fading, which would
  // show the page through it.
  const veilStyle = useAnimatedStyle(() => {
    const d = y + h / 2 - (scrollY.value + middle.value)
    const edge = Math.max(0, Math.abs(d) - h / 2)
    return { opacity: interpolate(edge, [0, FADE_DISTANCE], [0, 1 - DIM], 'clamp') }
  })

  return (
    <Animated.View onLayout={(e) => onCardLayout(cardKey, e)} style={[styles.card, style]}>
      <View pointerEvents={lit ? 'auto' : 'none'}>{children}</View>
      <Animated.View pointerEvents="none" style={[styles.veil, veilStyle]} />
      {lit ? null : (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onCardPress(index)} accessibilityRole="button" />
      )}
    </Animated.View>
  )
})

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, gap: GAP },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 6,
    },
    // Reaches over the hairline border too, so a dim card has no bright outline.
    veil: { position: 'absolute', top: -1, bottom: -1, left: -1, right: -1, borderRadius: 24, backgroundColor: colors.bg },
  })
