import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ReactElement, type Ref } from 'react'
import { StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from 'react-native'
import { KeyboardChatScrollView } from 'react-native-keyboard-controller'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { ConversationHandle } from '@/components/chat/ConversationList'
import type { RowMessage } from '@/components/chat/MessageRow'
import { useHeaderHeight } from '@/components/chrome/GlassHeader'
import { Flash } from '@/components/overlays/Flash'
import { isWeb } from '@/lib/core/platform'

import { holdHydration } from './hydration'

// How far above the newest message the list has to be before the jump button shows up.
const JUMP_THRESHOLD = 240
// Within this share of the screen from the end, a streaming reply is followed as it grows.
const FOLLOW_SHARE = 0.15
// How long after a scroll the rows wait before taking on their rich views.
const SCROLL_REST = 800
// A chat handed to the thread has landed once its size has not changed for this long.
const LANDED_AFTER = 40

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

  const scrollToNewest = useCallback((animated = true) => {
    listRef.current?.scrollToEnd({ animated })
  }, [])

  useImperativeHandle(ref, () => ({ scrollToNewest: () => scrollToNewest(), jumpToNewest: () => scrollToNewest() }), [scrollToNewest])

  // Another chat: the thread is held at its newest message until it lands. The list lays
  // rows out in passes (first at a guessed height, then measured), so a thread that showed
  // a long chat was put at the end once and then crept on to it, scrolled by the list itself.
  const landing = useRef(true)
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const landedRef = useRef(onLanded)
  landedRef.current = onLanded
  const land = useCallback((key: number) => {
    if (landedTimer.current) clearTimeout(landedTimer.current)
    landedTimer.current = setTimeout(() => {
      landing.current = false
      landedRef.current?.(key)
    }, LANDED_AFTER)
  }, [])
  const shownKey = useRef(chatKey)
  if (shownKey.current !== chatKey) {
    shownKey.current = chatKey
    landing.current = true
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
    if (!landing.current) return
    listRef.current?.scrollToEnd({ animated: false })
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

  const away = useRef(false)
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      // A web scroll event FlashList passes on can come without the sizes.
      if (!contentOffset || !contentSize || !layoutMeasurement) return
      const back = contentSize.height - layoutMeasurement.height - contentOffset.y + inset.current
      if ((back > JUMP_THRESHOLD) !== away.current) {
        away.current = back > JUMP_THRESHOLD
        onAwayChange?.(away.current)
      }
    },
    [onAwayChange]
  )

  // Rows take on their rich views only once the list rests.
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reason = useMemo(() => `thread:${Math.random()}`, [])
  const moving = useCallback(() => {
    landing.current = false
    if (restTimer.current) clearTimeout(restTimer.current)
    holdHydration(reason, true)
  }, [reason])
  const rested = useCallback(() => {
    if (restTimer.current) clearTimeout(restTimer.current)
    restTimer.current = setTimeout(() => holdHydration(reason, false), SCROLL_REST)
  }, [reason])
  useEffect(
    () => () => {
      if (restTimer.current) clearTimeout(restTimer.current)
      holdHydration(reason, false)
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
        : function ThreadScroll(props: ScrollViewProps) {
            return (
              <KeyboardChatScrollView
                {...props}
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
      maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: FOLLOW_SHARE, animateAutoScrollToBottom: false }}
      onScroll={onScroll}
      onContentSizeChange={onContentSizeChange}
      onScrollBeginDrag={moving}
      onScrollEndDrag={rested}
      onMomentumScrollBegin={moving}
      onMomentumScrollEnd={rested}
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
    />
  )
}

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
