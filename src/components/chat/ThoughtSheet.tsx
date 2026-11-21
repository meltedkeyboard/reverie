import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native'

import { Markdown } from '@/components/chat/Markdown'
import { useStore } from '@/components/chat/thread/store'
import { ChatBackdrop, useChatBackdropTone } from '@/components/chrome/ChatChrome'
import { BottomSheet, SheetBackdropContext } from '@/components/overlays/BottomSheet'
import { ShimmerText } from '@/components/visuals/ShimmerText'
import { useTranslation } from '@/i18n'
import { CHAT_METRICS, useChatText } from '@/lib/chat/chatText'
import { isIOS } from '@/lib/core/platform'
import {
  closeThoughtSession,
  finishThoughtSession,
  thoughtSession,
  type ThoughtData,
} from '@/lib/chat/thoughtSession'
import { SchemeOverride, useColors, useStyles, type Colors } from '@/theme'

type ContentProps = ThoughtData & {
  scrollStyle?: StyleProp<ViewStyle>
}

export function ThoughtSheetContent({
  text,
  live,
  scrollStyle,
}: ContentProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const chatText = useChatText()

  const textSizeStyle = useMemo(
    () => ({
      fontFamily: chatText.fontFamily,
      fontSize: chatText.scaled(CHAT_METRICS.bot.size),
      lineHeight: chatText.scaled(CHAT_METRICS.bot.line),
      letterSpacing: 0.1,
      color: colors.text,
    }),
    [chatText, colors.text]
  )

  const scrollRef = useRef<ScrollViewInstance>(null)
  const atEnd = useRef(true)
  const dragging = useRef(false)

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
    atEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 30
  }, [])

  useEffect(() => {
    if (live && atEnd.current && !dragging.current) {
      scrollRef.current?.scrollToEnd({ animated: false })
    }
  }, [text, live])

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.scroll, scrollStyle]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled={true}
      contentInsetAdjustmentBehavior="automatic"
      onScroll={onScroll}
      scrollEventThrottle={32}
      onScrollBeginDrag={() => (dragging.current = true)}
      onScrollEndDrag={() => (dragging.current = false)}
      onContentSizeChange={() => {
        if (live && atEnd.current && !dragging.current) {
          scrollRef.current?.scrollToEnd({ animated: false })
        }
      }}
    >
      {!text.trim() && live ? (
        <View style={styles.waitingContainer}>
          <ShimmerText text={t('message.thinking')} style={[styles.waitingText, textSizeStyle]} />
        </View>
      ) : (
        <Markdown
          text={text}
          style={[styles.thoughtText, textSizeStyle]}
          streaming={live}
          selectable
          unwrapIndentedCode
        />
      )}
    </ScrollView>
  )
}

type SheetProps = ThoughtData & {
  visible: boolean
  onClose: () => void
  onDismissed?: () => void
}

export function ThoughtSheet({ visible, onClose, onDismissed, ...thought }: SheetProps) {
  const scheme = useChatBackdropTone(thought.look)
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const title = thought.speakerName ?? t('message.reasoning')

  return (
    <SchemeOverride scheme={scheme}>
      <SheetBackdropContext.Provider value={scheme !== null}>
        <BottomSheet
          visible={visible}
          onClose={onClose}
          onDismissed={onDismissed}
          title={title}
          compactHeader
          dragHandleOnly
          noGlass
          underlay={<ChatBackdrop owner={thought.look} />}
        >
          <ThoughtSheetContent {...thought} scrollStyle={styles.sheetScroll} />
        </BottomSheet>
      </SheetBackdropContext.Provider>
    </SchemeOverride>
  )
}

export function ThoughtSheetHost() {
  const session = useStore(thoughtSession)
  if (isIOS || !session) return null

  return (
    <ThoughtSheet
      {...session}
      visible={Boolean(session)}
      onClose={closeThoughtSession}
      onDismissed={finishThoughtSession}
    />
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    sheetScroll: {
      maxHeight: 460,
    },
    contentRoot: {
      flex: 1,
      minHeight: 200,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      paddingBottom: 36,
    },
    waitingContainer: {
      paddingVertical: 12,
      alignItems: 'flex-start',
    },
    waitingText: {
      color: colors.textMuted,
    },
    thoughtText: {
      color: colors.text,
      letterSpacing: 0.1,
    },
  })
