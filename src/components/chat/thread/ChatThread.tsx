import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ReactElement, type Ref } from 'react'
import { StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type ScrollViewInstance } from 'react-native'
import { KeyboardChatScrollView } from 'react-native-keyboard-controller'
import Animated, { scrollTo, useAnimatedRef, useAnimatedStyle, useScrollOffset, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnUI } from 'react-native-worklets'

import type { ConversationHandle } from '@/components/chat/ConversationList'
import type { RowMessage } from '@/components/chat/MessageRow'
import { useHeaderHeight } from '@/components/chrome/GlassHeader'
import { Flash } from '@/components/overlays/Flash'
import { isWeb } from '@/lib/core/platform'

import { slowHydration } from './hydration'

// How far above the newest message the list has to be before the jump button shows up.
const JUMP_THRESHOLD = 240
// A reader who scrolled up is left there until they come back within this of the end (pt).
const FOLLOW_BACK = 80
// How long after a scroll the rows go back to taking on their rich views at full pace.
const SCROLL_REST = 300
// How far past the screen the list keeps rows laid out (pt). Rows take on their rich views
// there, as they come in during a scroll, so the reader comes onto rows already selectable
// instead of ones that switch in front of them. FlashList's own 250 left about a message
// on either side, too little to upgrade one before it showed.
const DRAW_DISTANCE = 700
// A chat handed to the thread has landed once its size has not changed for this long.
const LANDED_AFTER = 40
// How long a scroll the thread makes itself may take: a finger that comes down meanwhile
// stops it where it is.
const OWN_SCROLL = 600

type Props = {
  ref?: Ref<ConversationHandle>
  // Which chat the rows are of: a new one starts at its newest message.
  chatKey: number
  // Oldest first. A row with `streaming` is the live draft.
  rows: RowMessage[]
  renderRow: (row: RowMessage) => ReactElement
  extraData?: unknown
  composerHeight: SharedValue<number>
  // Above the oldest message, and below the newest.
  top?: ReactElement | null
  bottom?: ReactElement | null
  onAwayChange?: (away: boolean) => void
  // A message to scroll to and flash once it is loaded, e.g. one opened from search.
  focusId?: number | null
  // The keyboard moves only the thread on screen; the other stays as it is.
  frozen: SharedValue<boolean>
  // The chat of `chatKey` is laid out and sits at its newest message.
  onLanded?: (chatKey: number) => void
}

// The message list of a character's chat, made to be handed another chat in place. Its
// cells are recycled (FlashList), so a chat shown in a thread that showed another one gets
// new text in views that are already there instead of views made anew. The screen keeps
// two of them, one behind the other, and switches between them (see `chat/[id].tsx`).
export function ChatThread({
  ref,
  chatKey,
  rows,
  renderRow,
  extraData,
  composerHeight,
  top,
  bottom,
  onAwayChange,
  focusId,
  frozen,
  onLanded,
}: Props) {
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const listRef = useRef<FlashListRef<Item>>(null)
  const inset = useRef(0)
  const away = useRef(false)
  // Whether a growing reply is followed, done here rather than by the list's own autoscroll:
  // that one scrolled to the end on every token even under a dragging finger, which left the
  // list at the end again, near enough for the next token, so the reader could not get away.
  // A drag lets go of the end; coming back to it, or the jump button, takes it up again.
  const follow = useRef(true)
  // A reply is being written: only then does a list let go near the end snap onto it.
  const generating = useRef(false)
  generating.current = rows.some((row) => row.streaming)
  // A finger is on the list: nothing scrolls it from under the finger, followed or not.
  const held = useRef(false)
  // Nor while it glides on after the finger.
  const gliding = useRef(false)
  // A finger is down on the list, told by its touches rather than by its scroll: the drag's
  // events can be lost when the drawer's pan takes the touch, which left the list followed
  // under the finger.
  const touching = useRef(false)
  const back = useRef(0)
  const viewport = useRef(0)
  const lastY = useRef(0)
  // The scroll view itself, whose offset is known on the UI thread: a scroll the thread made
  // is stopped where it is at that moment, not where the JS last heard it was, which would
  // pull the list back.
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const offset = useScrollOffset(isWeb ? null : scrollRef)
  // FlashList hands its own ref to the scroll component, which gets both.
  const listScroll = useRef<Ref<unknown>>(null)
  const scrollRefs = useCallback(
    (node: ScrollViewInstance | null) => {
      scrollRef(node)
      const theirs = listScroll.current
      if (typeof theirs === 'function') theirs(node)
      else if (theirs) (theirs as { current: unknown }).current = node
    },
    [scrollRef]
  )
  // Until when a scroll the thread made itself may still be on its way (ms since the epoch).
  const ownUntil = useRef(0)

  // Scrolls to the newest message with the scroll view's own animation, which a finger can
  // stop. FlashList's scrollToEnd from far away went in steps over several renders that
  // nothing could stop, and pulled the list on from under the finger.
  const glideToEnd = useCallback(() => {
    // FlashList types it as the ScrollView component rather than its instance.
    const scroller = listRef.current?.getNativeScrollRef() as ScrollViewInstance | null | undefined
    if (!scroller) return
    // From further than two screens it starts two screens short, as FlashList did, so the
    // list does not draw every row on the way.
    if (viewport.current && back.current > viewport.current * 2) {
      scroller.scrollTo({ y: lastY.current + back.current - viewport.current * 2, animated: false })
    }
    ownUntil.current = Date.now() + OWN_SCROLL
    scroller.scrollToEnd({ animated: true })
  }, [])

  const scrollToNewest = useCallback(
    (animated = true) => {
      follow.current = true
      if (animated) glideToEnd()
      else listRef.current?.scrollToEnd({ animated })
      if (away.current) {
        away.current = false
        onAwayChange?.(false)
      }
    },
    [onAwayChange, glideToEnd]
  )

  useImperativeHandle(ref, () => ({ scrollToNewest: () => scrollToNewest(), jumpToNewest: () => scrollToNewest() }), [scrollToNewest])

  // Another chat: the thread is held at its newest message until it lands. The list lays
  // rows out in passes (first at a guessed height, then measured), so a thread that showed
  // a long chat was put at the end once and then crept on to it, scrolled by the list itself.
  const landing = useRef(true)
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const landedRef = useRef(onLanded)
  landedRef.current = onLanded
  const land = useCallback(
    (key: number) => {
      if (landedTimer.current) clearTimeout(landedTimer.current)
      landedTimer.current = setTimeout(() => {
        landing.current = false
        if (away.current) {
          away.current = false
          onAwayChange?.(false)
        }
        landedRef.current?.(key)
      }, LANDED_AFTER)
    },
    [onAwayChange]
  )
  const shownKey = useRef(chatKey)
  if (shownKey.current !== chatKey) {
    shownKey.current = chatKey
    landing.current = true
    follow.current = true
    if (away.current) {
      away.current = false
      onAwayChange?.(false)
    }
  }
  // Lands even if the size does not change, as from one empty chat to another.
  useEffect(() => {
    land(chatKey)
  }, [chatKey, land])
  useEffect(
    () => () => {
      if (landedTimer.current) clearTimeout(landedTimer.current)
    },
    []
  )
  const onContentSizeChange = useCallback(() => {
    const free = !held.current && !gliding.current && !touching.current
    if (!landing.current) {
      // Following keeps up with a reply growing at the end; a list a screen or more away
      // from it was left by the reader. FlashList's scrollToEnd from there is not a jump but
      // a scroll in steps over several frames, which fought the finger until it got there.
      if (follow.current && viewport.current && back.current > viewport.current) follow.current = false
      if (follow.current && free) listRef.current?.scrollToEnd({ animated: false })
      return
    }
    if (free) listRef.current?.scrollToEnd({ animated: false })
    land(shownKey.current)
  }, [land])

  // Jumps once per focus target, once the row is there.
  const jumped = useRef<number | null>(null)
  // The intro (the character's photo and name) is the first item of the list, not its
  // header: the list lays a short chat out from the bottom, and a header stayed at the top,
  // far from the first message it belongs above.
  const items = useMemo<Item[]>(() => (top ? [INTRO, ...rows] : rows), [top, rows])
  const focusIndex = focusId == null ? -1 : items.findIndex((item) => !isIntro(item) && item.id === focusId)
  useEffect(() => {
    if (focusIndex === -1 || jumped.current === focusId) return
    jumped.current = focusId ?? null
    landing.current = false
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: focusIndex, viewPosition: 0.5, animated: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusId, focusIndex])

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      // A web scroll event FlashList passes on can come without the sizes.
      if (!contentOffset || !contentSize || !layoutMeasurement) return
      viewport.current = layoutMeasurement.height
      lastY.current = contentOffset.y
      back.current = contentSize.height - layoutMeasurement.height - contentOffset.y + inset.current
      // Brought back to the end, by a drag or a fling, the reply takes the reader up again.
      if (back.current <= FOLLOW_BACK) follow.current = true
      else if (held.current || gliding.current) follow.current = false
      if ((back.current > JUMP_THRESHOLD) !== away.current) {
        away.current = back.current > JUMP_THRESHOLD
        onAwayChange?.(away.current)
      }
    },
    [onAwayChange]
  )

  // Rows take on their rich views more slowly while the list scrolls.
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reason = useMemo(() => `thread:${Math.random()}`, [])
  const moving = useCallback(() => {
    landing.current = false
    if (restTimer.current) clearTimeout(restTimer.current)
    slowHydration(reason, true)
  }, [reason])
  const grabbed = useCallback(() => {
    held.current = true
    follow.current = false
    moving()
  }, [moving])
  const rested = useCallback(() => {
    if (restTimer.current) clearTimeout(restTimer.current)
    restTimer.current = setTimeout(() => slowHydration(reason, false), SCROLL_REST)
  }, [reason])
  // Let go near the end while a reply is written, the list snaps onto it, as onto a magnet;
  // after a fling, once it stops there. Put off a moment, for the fling's start to arrive
  // after the release. A chat only read stays where the finger left it.
  const snap = useCallback(() => {
    if (generating.current && follow.current && !held.current && !gliding.current && !touching.current) glideToEnd()
  }, [glideToEnd])
  const released = useCallback(() => {
    held.current = false
    touching.current = false
    setTimeout(snap, 50)
    rested()
  }, [rested, snap])
  const glide = useCallback(() => {
    gliding.current = true
    moving()
  }, [moving])
  // The list reports the end of its own scrolls here too, a jump included: only a fling the
  // finger started snaps, or every step of following a reply set off a glide to where it was.
  const glided = useCallback(() => {
    const flung = gliding.current
    gliding.current = false
    if (flung) snap()
    rested()
  }, [rested, snap])
  const touched = useCallback(() => {
    touching.current = true
    // A finger on the list stops a scroll the thread is making where it is, and the thread
    // no longer follows the reply: back within FOLLOW_BACK of the end, onScroll takes it up.
    if (isWeb || Date.now() >= ownUntil.current) return
    ownUntil.current = 0
    follow.current = false
    scheduleOnUI(() => {
      'worklet'
      scrollTo(scrollRef, 0, offset.value, false)
    })
  }, [scrollRef, offset])
  const untouched = useCallback(() => {
    touching.current = false
  }, [])
  useEffect(
    () => () => {
      if (restTimer.current) clearTimeout(restTimer.current)
      slowHydration(reason, false)
    },
    [reason]
  )

  const onContentInsetChange = useCallback((next: { bottom: number }) => {
    inset.current = next.bottom
  }, [])

  // Made once: a new scroll component would take the list down with it.
  const renderScroll = useMemo(
    () =>
      isWeb
        ? undefined
        : function ThreadScroll({ ref, ...props }: ScrollViewProps & { ref?: Ref<unknown> }) {
            listScroll.current = ref ?? null
            return (
              <KeyboardChatScrollView
                {...props}
                ref={scrollRefs}
                keyboardLiftBehavior="always"
                offset={insets.bottom}
                freeze={frozen}
                onContentInsetChange={onContentInsetChange}
              />
            )
          },
    // The bottom inset of a phone does not change while the screen is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // The newest message stops above the composer, which floats over the list: the room for
  // it is part of the content and grows with the field on the UI thread. As an inset of the
  // scroll view (the keyboard view's extraContentPadding) it was left out by the list's
  // scrollToEnd and its following of a streaming reply, which ended under the field.
  const composerRoom = useAnimatedStyle(() => ({ height: composerHeight.value + (isWeb ? 16 : 0) }))

  const renderItem = useCallback(
    ({ item: row }: ListRenderItemInfo<Item>) => {
      if (isIntro(row)) return top ?? null
      const content = renderRow(row)
      if (row.id !== focusId) return content
      return (
        <View>
          <Flash style={styles.flash} />
          {content}
        </View>
      )
    },
    [renderRow, focusId, top]
  )

  return (
    <FlashList
      ref={listRef}
      data={items}
      extraData={extraData}
      keyExtractor={keyOf}
      getItemType={typeOf}
      renderItem={renderItem}
      renderScrollComponent={renderScroll}
      maintainVisibleContentPosition={POSITION}
      drawDistance={DRAW_DISTANCE}
      onScroll={onScroll}
      onContentSizeChange={onContentSizeChange}
      onScrollBeginDrag={grabbed}
      onScrollEndDrag={released}
      onMomentumScrollBegin={glide}
      onMomentumScrollEnd={glided}
      onTouchStart={touched}
      onTouchEnd={untouched}
      onTouchCancel={untouched}
      scrollEventThrottle={isWeb ? 16 : 32}
      ListHeaderComponent={<View style={{ height: headerHeight + 12 }} />}
      ListFooterComponent={
        <View style={styles.end}>
          {bottom}
          <Animated.View style={composerRoom} />
        </View>
      }
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      // A tap on the status bar would fling a chat up to its first message, far from where
      // it is read and written, laying out every row on the way.
      scrollsToTop={false}
    />
  )
}

// No autoscrollToBottomThreshold: the thread follows a reply itself (see `follow`).
const POSITION = { startRenderingFromBottom: true }

const INTRO = { intro: true } as const
type Item = RowMessage | typeof INTRO
const isIntro = (item: Item): item is typeof INTRO => item === INTRO

const keyOf = (item: Item) => (isIntro(item) ? 'intro' : item.streaming ? 'draft' : String(item.id))
// Rows are recycled within their kind, which share a layout.
const typeOf = (item: Item) => (isIntro(item) ? 'intro' : item.kind === 'narration' ? 'narration' : item.role)

const styles = StyleSheet.create({
  flash: { left: 8, right: 8, borderRadius: 18 },
  end: { paddingBottom: 8 },
})
