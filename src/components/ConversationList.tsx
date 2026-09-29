import Ionicons from '@expo/vector-icons/Ionicons'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactElement, type Ref } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native'
import { KeyboardChatScrollView } from 'react-native-keyboard-controller'
import Animated, { FadeIn, FadeOut, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Flash } from '@/components/Flash'
import { GlassButton } from '@/components/Glass'
import { useHeaderHeight } from '@/components/GlassHeader'
import type { RowMessage } from '@/components/MessageRow'
import { useTranslation } from '@/i18n'
import { liquidGlass } from '@/lib/nativeUI'
import { useColors, useStyles, type Colors } from '@/theme'

// How far above the newest message the list has to be before the jump button shows up.
const JUMP_THRESHOLD = 240
// How far back the user has to scroll before a streaming reply stops following its tail.
const HOLD_THRESHOLD = 24

export type ConversationHandle = {
  scrollToNewest: () => void
  // Scrolls down and, while a reply streams, keeps following it.
  jumpToNewest: () => void
}

type Props = {
  ref?: Ref<ConversationHandle>
  // Newest first: the list is inverted. A row with `streaming` is the live draft.
  rows: RowMessage[]
  renderRow: (row: RowMessage) => ReactElement
  extraData?: unknown
  composerHeight: SharedValue<number>
  header?: ReactElement | null
  footer?: ReactElement | null
  onAwayChange: (away: boolean) => void
  // A message to scroll to and flash once it is loaded, e.g. one opened from search.
  focusId?: number | null
}

const MAX_JUMP_ATTEMPTS = 5

export function ConversationList({
  ref,
  rows,
  renderRow,
  extraData,
  composerHeight,
  header,
  footer,
  onAwayChange,
  focusId,
}: Props) {
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const styles = useStyles(createStyles)
  const listRef = useRef<FlatList<RowMessage>>(null)
  const restInset = useRef(0)
  const [scrolledBack, setScrolledBack] = useState(false)
  const [listHeight, setListHeight] = useState(0)
  const [draftHeight, setDraftHeight] = useState(0)
  // Set by the jump button while a reply streams: the user asked to watch it come in.
  const [followTail, setFollowTail] = useState(false)
  const draftIndex = rows.findIndex((row) => row.streaming)

  const scrollToNewest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: -restInset.current, animated: true })
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      scrollToNewest,
      jumpToNewest: () => {
        if (draftIndex !== -1) setFollowTail(true)
        scrollToNewest()
      },
    }),
    [scrollToNewest, draftIndex]
  )

  useEffect(() => {
    if (draftIndex === -1) setFollowTail(false)
  }, [draftIndex])

  // Jumps once per focus target. Rows far back are not rendered yet, so a failed jump
  // first scrolls to where the row should roughly be and then tries again.
  const jumped = useRef<number | null>(null)
  const jumpAttempts = useRef(0)
  const focusIndex = focusId == null ? -1 : rows.findIndex((row) => row.id === focusId)
  useEffect(() => {
    if (focusIndex === -1 || jumped.current === focusId) return
    jumped.current = focusId ?? null
    jumpAttempts.current = 0
    const frame = requestAnimationFrame(() =>
      listRef.current?.scrollToIndex({ index: focusIndex, viewPosition: 0.5, animated: false })
    )
    return () => cancelAnimationFrame(frame)
  }, [focusId, focusIndex])

  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    if (++jumpAttempts.current > MAX_JUMP_ATTEMPTS) return
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
    setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: false }), 80)
  }, [])

  const onContentInsetChange = useCallback((inset: { top: number }) => {
    restInset.current = inset.top
  }, [])

  // The list is inverted, so the offset grows as the user scrolls back in time.
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const back = event.nativeEvent.contentOffset.y + restInset.current
      onAwayChange(back > JUMP_THRESHOLD)
      setScrolledBack(back > HOLD_THRESHOLD)
    },
    [onAwayChange]
  )

  const onDraftLayout = useCallback((event: LayoutChangeEvent) => {
    setDraftHeight(event.nativeEvent.layout.height)
  }, [])

  // A streaming reply follows its tail only while all of it fits between the header and
  // the composer. Once its start reaches the header, or the user has scrolled back, the
  // row above it is held in place and the reply grows off the bottom of the screen
  // instead of dragging the text being read along with it.
  const room = listHeight - restInset.current - headerHeight - 20
  const holdPosition =
    draftIndex !== -1 && !followTail && (scrolledBack || (listHeight > 0 && draftHeight > room))

  // When the reply is done its row turns into the saved message and gains the action
  // bar. Letting go of the held row in that same frame shifts the text being read, so
  // the hold outlasts the stream for a moment. Set during render: an effect would let
  // go one commit too late.
  const [held, setHeld] = useState<number | null>(null)
  const holdIndex = holdPosition ? draftIndex + 1 : null
  if (draftIndex !== -1 && held !== holdIndex) setHeld(holdIndex)
  const anchor = draftIndex !== -1 ? holdIndex : held

  useEffect(() => {
    if (draftIndex !== -1 || held === null) return
    const timer = setTimeout(() => setHeld(null), 800)
    return () => clearTimeout(timer)
  }, [draftIndex, held])

  const renderScroll = useCallback(
    (props: ScrollViewProps) => (
      <KeyboardChatScrollView
        {...props}
        inverted
        keyboardLiftBehavior="always"
        offset={insets.bottom}
        extraContentPadding={composerHeight}
        onContentInsetChange={onContentInsetChange}
      />
    ),
    [insets.bottom, composerHeight, onContentInsetChange]
  )

  const renderItem = useCallback(
    ({ item: row }: ListRenderItemInfo<RowMessage>) => {
      const content = renderRow(row)
      if (row.streaming) return <View onLayout={onDraftLayout}>{content}</View>
      if (row.id !== focusId) return content
      return (
        <View>
          <Flash style={styles.flash} />
          {content}
        </View>
      )
    },
    [renderRow, onDraftLayout, focusId]
  )

  return (
    <FlatList
      ref={listRef}
      inverted
      data={rows}
      extraData={extraData}
      keyExtractor={(row) => (row.streaming ? 'draft' : String(row.id))}
      renderItem={renderItem}
      renderScrollComponent={renderScroll}
      onScroll={onScroll}
      onScrollBeginDrag={() => setFollowTail(false)}
      onScrollToIndexFailed={onScrollToIndexFailed}
      onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
      maintainVisibleContentPosition={anchor !== null ? { minIndexForVisible: anchor } : undefined}
      scrollEventThrottle={32}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        // The list is inverted, so this visually sits just above the composer.
        paddingTop: 8,
        paddingBottom: headerHeight + 12,
      }}
    />
  )
}

// Floats above the composer once the newest message is out of sight.
export function JumpButton({ onPress }: { onPress: () => void }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={styles.jumpSlot}>
      {liquidGlass ? (
        <GlassButton icon="arrow-down" onPress={onPress} />
      ) : (
        <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.jump, pressed && { opacity: 0.7 }]}>
          <Ionicons name="arrow-down" size={18} color={colors.text} />
        </Pressable>
      )}
    </Animated.View>
  )
}

// Shown at the newest end of the list when a reply failed.
export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}>
        <Text style={styles.retryText}>{t('chat.retry')}</Text>
      </Pressable>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    error: {
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
    },
    errorText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    retry: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surfaceRaised },
    retryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    jumpSlot: { marginBottom: 12 },
    flash: { left: 8, right: 8, borderRadius: 18 },
    jump: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
  })
