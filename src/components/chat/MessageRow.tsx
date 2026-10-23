import { Icon } from '@/components/visuals/Icon'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import type { Message } from '@/db/messages'
import { useElapsedSeconds } from '@/hooks/util/useElapsedSeconds'
import { CHAT_COLUMN } from '@/hooks/util/useLayoutMode'
import { useTranslation } from '@/i18n'
import type { MessageImage } from '@/db/messages'
import { withAlpha } from '@/lib/core/color'
import { isWeb } from '@/lib/core/platform'
import { showSheet } from '@/lib/ui/dialogs'
import * as Haptics from '@/lib/ui/haptics'
import { pictureUri } from '@/lib/images/attachments'
import { CHAT_METRICS, useChatText } from '@/lib/chat/chatText'
import { menuItems, messageActions, type MessageAction } from '@/lib/chat/messageActions'
import { useColors, useStyles, type Colors } from '@/theme'

import { Avatar } from '../visuals/Avatar'
import { IconButton } from '../controls/IconButton'
import { ImageLink, useImageGroup, type ImageGroup } from '../visuals/ImageLink'
import { Markdown, SelectableText } from './Markdown'
import { NativeMenu, TapTrigger } from '../overlays/NativeMenu'
import { Pager } from '../lists/Pager'
import { PlainSymbol } from '../visuals/PlainSymbol'
import { useHydrated, type Hydration } from './thread/hydration'
import { SFIcon } from '../visuals/SFIcon'
import { ShimmerText } from '../visuals/ShimmerText'
import { TypingIndicator } from './TypingIndicator'

// The live draft also carries what a reasoning model is thinking; reasoningMs is set
// once the thinking is over and the reply has started. `refine` is the wish it is being
// written with.
export type RowMessage = Message & { streaming?: boolean; reasoning?: string; reasoningMs?: number | null; refine?: string }

// How a line sits in a room's scene, already turned into names. Absent in a one-on-one
// chat, where the row looks as it always did.
export type RowScene = {
  // Who said an assistant line; null once that character was deleted.
  speaker: { name: string; avatar: string | null; color: string } | null
  // The characters it was said to, when that is not simply the user.
  to: string | null
  // Everyone who was meant to hear a whisper.
  whisper: string | null
  overheard: string | null
}

type Props = {
  message: RowMessage
  canRegenerate: boolean
  locked: boolean
  onAction: (message: RowMessage, action: MessageAction) => void
  onSelectVariant: (id: number, variant: number) => void
  // How much of the user's bubble color shows: below 1 over a chat background.
  bubbleOpacity?: number
  scene?: RowScene
  // Whether it comes up plain and takes on the selectable text, the native menu and the
  // animated symbols later, a row a frame while nothing moves (see thread/hydration).
  hydrate?: Hydration
}

// The family and scaled size a line of chat text takes from the settings.
function textSize({ fontFamily, scaled }: ReturnType<typeof useChatText>, metrics: { size: number; line: number }) {
  return { fontFamily, fontSize: scaled(metrics.size), lineHeight: scaled(metrics.line) }
}

// A long press on a picture the user sent opens the message menu. Text has no such menu,
// the user's as much as a reply's: a long press there selects it, and the actions sit in
// the bar below.
const LONG_PRESS_MS = 350

function MessageRowView({ message, canRegenerate, locked, onAction, onSelectVariant, bubbleOpacity = 1, scene, hydrate = 'off' }: Props) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const chatText = useChatText()
  const narration = message.kind === 'narration'
  const isUser = message.role === 'user' && !narration
  // A streaming reply stays plain: its text changes with every token.
  const rich = useHydrated(message.streaming ? 'stream' : `${message.id}:${message.variant}`, hydrate)
  const held = useHeldText(Boolean(message.streaming), message.content)
  // The pictures of the message, swiped through together in the viewer.
  const pictures = useImageGroup()
  const actions = useMemo(
    () => messageActions(message, { canRegenerate, locked }),
    [message, canRegenerate, locked]
  )

  const openSheet = () => {
    if (message.streaming) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    showSheet(
      undefined,
      menuItems(actions, (action) => onAction(message, action))
    )
  }

  const bar = message.streaming ? null : (
    <ActionBar
      message={message}
      actions={actions}
      onAction={onAction}
      onSelectVariant={onSelectVariant}
      locked={locked}
      rich={rich}
    />
  )

  const markdown = (
    <Markdown
      key={message.streaming ? 'stream' : `${message.variant}:${message.content}`}
      text={held.shown}
      style={
        narration
          ? [styles.botText, styles.narrationText, textSize(chatText, CHAT_METRICS.narration)]
          : [styles.botText, textSize(chatText, CHAT_METRICS.bot)]
      }
      emStyle={styles.action}
      streaming={message.streaming}
      selectable={rich}
      onSelect={message.streaming ? held.onSelect : undefined}
    />
  )
  const text = message.streaming ? <View {...held.touch}>{markdown}</View> : markdown

  if (narration) {
    return (
      <View style={styles.narrationRow}>
        <View style={styles.narrationRule} />
        {text}
        <View style={styles.narrationRule} />
        {bar}
      </View>
    )
  }

  if (isUser) {
    return (
      <View style={styles.userRow}>
        {scene?.whisper || scene?.to ? (
          <View style={styles.caption}>
            <Icon name={scene.whisper ? 'lock-closed' : 'arrow-forward'} size={11} color={colors.textFaint} />
            <Text style={styles.captionText} numberOfLines={1}>
              {scene.whisper ? t('room.whisperTo', { names: scene.whisper }) : scene.to}
            </Text>
          </View>
        ) : null}
        {message.images.map((image, index) => (
          <Picture key={index} image={image} group={pictures} index={index} onLongPress={openSheet} />
        ))}
        {message.content ? (
          <View
            style={[
              styles.bubble,
              bubbleOpacity < 1 && { backgroundColor: withAlpha(colors.bubble, bubbleOpacity) },
              scene?.whisper ? styles.whisperBubble : null,
            ]}
          >
            {chatText.userMarkdown ? (
              <Markdown
                key={`${message.variant}:${message.content}`}
                text={message.content}
                style={[styles.userText, textSize(chatText, CHAT_METRICS.user), { fontFamily: chatText.userFontFamily }]}
                selectable={rich}
              />
            ) : rich ? (
              <SelectableText
                key={`${message.variant}:${message.content}`}
                style={[styles.userText, textSize(chatText, CHAT_METRICS.user), { fontFamily: chatText.userFontFamily }]}
              >
                {message.content}
              </SelectableText>
            ) : (
              <Text style={[styles.userText, textSize(chatText, CHAT_METRICS.user), { fontFamily: chatText.userFontFamily }]}>
                {message.content}
              </Text>
            )}
          </View>
        ) : null}
        {scene?.overheard ? <Overheard names={scene.overheard} end /> : null}
        {bar}
      </View>
    )
  }

  const waiting = message.streaming && !message.content.trim()
  const thought = message.streaming
    ? message.reasoning
      ? { text: message.reasoning, ms: message.reasoningMs ?? null }
      : null
    : message.thoughts[message.variant]
  const refine = message.streaming ? message.refine : message.refines[message.variant]
  const speaker = scene?.speaker
  return (
    <View style={[styles.botRow, message.kind === 'reaction' && styles.reactionRow]}>
      {refine ? (
        <RefineNote
          text={refine}
          live={Boolean(message.streaming)}
          locked={locked}
          canRegenerate={canRegenerate}
          rich={rich}
          onAction={(action) => onAction(message, action)}
        />
      ) : null}
      {scene ? (
        <View style={styles.speaker}>
          {speaker ? <Avatar name={speaker.name} file={speaker.avatar} size={22} /> : null}
          <Text style={[styles.speakerName, { color: speaker?.color ?? colors.textFaint }]} numberOfLines={1}>
            {speaker?.name ?? t('room.deletedCharacter')}
          </Text>
          {scene.to && !scene.whisper ? (
            <>
              <Icon name="arrow-forward" size={11} color={colors.textFaint} />
              <Text style={styles.captionText} numberOfLines={1}>
                {scene.to}
              </Text>
            </>
          ) : null}
          {scene.whisper ? (
            <View style={styles.whisperBadge}>
              <Icon name="lock-closed" size={10} color={colors.textMuted} />
              <Text style={styles.whisperText} numberOfLines={1}>
                {t('room.whisperTo', { names: scene.whisper })}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {thought ? (
        <ThoughtBlock
          key={message.streaming ? 'thought' : `thought:${message.id}:${message.variant}:${thought.text}`}
          text={thought.text}
          ms={thought.ms}
          memory={message.streaming ? liveThought(message.chatId) : `${message.id}:${message.variant}`}
          chatId={message.chatId}
        />
      ) : null}
      {waiting && thought ? null : waiting ? (
        <TypingIndicator />
      ) : (
        text
      )}
      {scene?.overheard ? <Overheard names={scene.overheard} /> : null}
      {bar}
    </View>
  )
}

function Overheard({ names, end = false }: { names: string; end?: boolean }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  return (
    <View style={[styles.caption, styles.overheard, end && styles.captionEnd]}>
      <Icon name="ear-outline" size={13} color={colors.textFaint} />
      <Text style={styles.captionText} numberOfLines={1}>
        {t('room.overheardBy', { names })}
      </Text>
    </View>
  )
}

export const MessageRow = memo(MessageRowView)

type RefineNoteProps = {
  text: string
  // The reply is still being written with it: the wish shimmers and has no menu yet.
  live: boolean
  locked: boolean
  canRegenerate: boolean
  rich: boolean
  onAction: (action: MessageAction) => void
}

// The wish a reply was refined with, small and grey above it, so the user can see why this
// version reads as it does. It is the user's own words, so a tap offers what their message
// has: copy, ask again with it, change it and ask again, or forget it (the reply stays).
function RefineNote({ text, live, locked, canRegenerate, rich, onAction }: RefineNoteProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()

  const body = (
    <View style={styles.refine}>
      {live ? (
        <ShimmerText text={text} style={styles.refineText} from={colors.textFaint} to={colors.text} wrap />
      ) : (
        <Text style={styles.refineText}>{text}</Text>
      )}
    </View>
  )
  if (live) return <View style={styles.refineTrigger}>{body}</View>

  const items = [
    {
      label: t('action.copy'),
      systemImage: 'doc.on.doc',
      onSelect: () => {
        Clipboard.setStringAsync(text)
        Haptics.selectionAsync()
      },
    },
    // The rest change the message, which waits while a reply is being written.
    ...(locked || !canRegenerate
      ? []
      : [
          { label: t('action.replyAgain'), systemImage: 'arrow.clockwise', onSelect: () => onAction('refineAgain') },
          { label: t('action.edit'), systemImage: 'pencil', onSelect: () => onAction('editRefine') },
        ]),
    ...(locked
      ? []
      : [{ label: t('action.delete'), systemImage: 'trash', destructive: true, separated: true, onSelect: () => onAction('dropRefine') }]),
  ]
  return rich ? (
    <NativeMenu items={items} style={styles.refineTrigger}>
      {body}
    </NativeMenu>
  ) : (
    <TapTrigger onPress={() => showSheet(undefined, items)} style={styles.refineTrigger}>
      {body}
    </TapTrigger>
  )
}

type ActionBarProps = {
  message: RowMessage
  actions: ReturnType<typeof messageActions>
  locked: boolean
  onAction: (message: RowMessage, action: MessageAction) => void
  onSelectVariant: (id: number, variant: number) => void
  // Off: the same buttons drawn without SwiftUI, the menu as the action sheet.
  rich: boolean
}

// The main action gets its own button next to copy: regenerating for a reply, editing
// for the user's own message. Everything else goes into the ellipsis menu.
function ActionBar({ message, actions, locked, onAction, onSelectVariant, rich }: ActionBarProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const [copied, setCopied] = useState(false)
  // Each press bumps its counter, which plays the symbol animation once.
  const [copies, setCopies] = useState(0)
  const [spins, setSpins] = useState(0)
  const isUser = message.role === 'user'
  const primary = isUser ? 'edit' : 'regenerate'
  const hasPrimary = actions.some((item) => item.action === primary)
  const menu = menuItems(
    actions.filter((item) => item.action !== 'copy' && item.action !== primary),
    (action) => onAction(message, action)
  )
  const count = message.variants.length

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    await Clipboard.setStringAsync(message.content)
    Haptics.selectionAsync()
    setCopied(true)
    setCopies((n) => n + 1)
  }

  return (
    <View style={[styles.bar, isUser && styles.barUser]}>
      {message.content ? (
        <IconButton
          name={copied ? 'checkmark' : 'copy-outline'}
          size={17}
          color={copied ? colors.success : colors.textFaint}
          onPress={copy}
          style={styles.barButton}
        >
          {rich ? (
            <SFIcon
              name={copied ? 'checkmark' : 'square.on.square'}
              fallback={copied ? 'checkmark' : 'copy-outline'}
              size={15}
              color={copied ? colors.success : colors.textFaint}
              effect={{ effect: 'bounce' }}
              trigger={copies}
            />
          ) : (
            <PlainSymbol
              name={copied ? 'checkmark' : 'square.on.square'}
              fallback={copied ? 'checkmark' : 'copy-outline'}
              size={15}
              box={SF_BOX}
              color={copied ? colors.success : colors.textFaint}
            />
          )}
        </IconButton>
      ) : null}
      {hasPrimary ? (
        <IconButton
          name={isUser ? 'create-outline' : 'refresh'}
          size={18}
          color={colors.textFaint}
          onPress={() => {
            setSpins((n) => n + 1)
            onAction(message, primary)
          }}
          style={styles.barButton}
        >
          {rich ? (
            <SFIcon
              name={isUser ? 'square.and.pencil' : 'arrow.clockwise'}
              fallback={isUser ? 'create-outline' : 'refresh'}
              size={15}
              color={colors.textFaint}
              effect={isUser ? { effect: 'bounce' } : { effect: 'rotate', direction: 'clockwise' }}
              trigger={spins}
            />
          ) : (
            <PlainSymbol
              name={isUser ? 'square.and.pencil' : 'arrow.clockwise'}
              fallback={isUser ? 'create-outline' : 'refresh'}
              size={15}
              box={SF_BOX}
              color={colors.textFaint}
            />
          )}
        </IconButton>
      ) : null}
      {menu.length && rich ? (
        <NativeMenu items={menu} style={styles.barButton}>
          {/* A plain glyph: a SwiftUI symbol inside the menu's label gets the accent tint. */}
          <Icon name="ellipsis-horizontal" size={17} color={colors.textFaint} />
        </NativeMenu>
      ) : menu.length ? (
        <TapTrigger onPress={() => showSheet(undefined, menu)} style={styles.barButton}>
          <PlainSymbol name="ellipsis" fallback="ellipsis-horizontal" size={ICON_SYMBOL * 17} box={17} color={colors.textFaint} />
        </TapTrigger>
      ) : null}
      {count > 1 ? (
        <Pager
          index={message.variant}
          count={count}
          disabled={locked}
          onChange={(variant) => onSelectVariant(message.id, variant)}
          style={{ marginLeft: 6 }}
        />
      ) : null}
    </View>
  )
}

// The boxes `SFIcon` and `Icon` give their symbols, which the plain ones keep.
const SF_BOX = Math.round(15 * 1.3)
const ICON_SYMBOL = 0.85

// Roughly four lines on a phone: enough to see the model is working, not a wall of text.
const THINKING_TAIL = 220
// Longer than this a press on the thought's lines is the start of a selection, not a tap.
const LINES_TAP_MS = 300
// How long after a selection is cleared a tap is still the one that cleared it.
const SELECTION_CLEAR_MS = 400
// How long after the finger lifts from text being written it is still held, for the
// selection of a long press to be told.
const HOLD_RELEASE_MS = 150

type ThoughtProps = {
  text: string
  // Null while the model is still thinking.
  ms: number | null
  // What it is remembered as unfolded by: the message and its version, or the chat whose
  // reply is being written. Without it the block forgets once it is gone.
  memory?: string
  chatId?: number
}

// The thoughts the reader unfolded, kept outside the rows: a cell of the list is handed
// another message once its own scrolls away (sending a message scrolls to the new reply),
// and a thought kept open in the cell folded up with it.
const unfolded = new Set<string>()
// The latest text of the thought of the reply being written in each chat. The saved reply
// with the same thought opens as that one was left, and a new reply whose thought does not
// go on from it starts folded.
const liveTexts = new Map<string, string>()
const liveThought = (chatId: number) => `live:${chatId}`

// Whether a block comes up unfolded, and whether that is taken over from the reply written.
function wasUnfolded(memory: string | undefined, chatId: number | undefined, text: string) {
  if (!memory || chatId === undefined) return { open: false, carried: false }
  const live = liveThought(chatId)
  if (memory === live) return { open: unfolded.has(live) && text.startsWith(liveTexts.get(live) ?? ''), carried: false }
  if (unfolded.has(memory)) return { open: true, carried: false }
  const carried = unfolded.has(live) && liveTexts.get(live) === text
  return { open: carried, carried }
}

// Text being written is replaced with every frame, and each replacement dropped a
// selection under way. A finger on it holds the text as it was until the finger lets go
// with nothing selected, or the selection is cleared; then it catches up.
function useHeldText(active: boolean, text: string) {
  const selection = useRef({ selected: false, clearedAt: 0, touching: false })
  const [held, setHeld] = useState<string | null>(null)
  const letGo = useRef<ReturnType<typeof setTimeout> | null>(null)
  const release = useCallback(() => {
    if (!selection.current.selected && !selection.current.touching) setHeld(null)
  }, [])
  const onSelect = useCallback(
    (selected: boolean) => {
      if (selection.current.selected && !selected) selection.current.clearedAt = Date.now()
      selection.current.selected = selected
      if (!selected) release()
    },
    [release]
  )
  const onTouchStart = useCallback(() => {
    selection.current.touching = true
    if (letGo.current) clearTimeout(letGo.current)
    if (active) setHeld((prev) => prev ?? text)
  }, [active, text])
  // Put off a moment: the selection a long press makes can be told after the finger lifts.
  const onTouchEnd = useCallback(() => {
    selection.current.touching = false
    if (letGo.current) clearTimeout(letGo.current)
    letGo.current = setTimeout(release, HOLD_RELEASE_MS)
  }, [release])
  useEffect(
    () => () => {
      if (letGo.current) clearTimeout(letGo.current)
    },
    []
  )
  const touch = useMemo(() => ({ onTouchStart, onTouchEnd, onTouchCancel: onTouchEnd }), [onTouchStart, onTouchEnd])
  return { shown: held ?? text, selection, onSelect, touch }
}

// Folded by default like in ChatGPT. While the model thinks, the folded block
// shows the latest lines so it is clear something is happening; afterwards only the
// header stays, and a tap unfolds the whole reasoning either way.
export function ThoughtBlock({ text, ms, memory, chatId }: ThoughtProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [initial] = useState(() => wasUnfolded(memory, chatId, text))
  const [open, setOpen] = useState(initial.open)
  const live = ms === null
  const seconds = useElapsedSeconds(live)
  const writing = memory !== undefined && chatId !== undefined && memory === liveThought(chatId)

  useEffect(() => {
    if (writing && memory) liveTexts.set(memory, text)
  }, [writing, memory, text])
  useEffect(() => {
    if (!memory) return
    if (open) unfolded.add(memory)
    else unfolded.delete(memory)
  }, [memory, open])
  // The saved reply took the open thought over from the one written.
  useEffect(() => {
    if (initial.carried && chatId !== undefined) unfolded.delete(liveThought(chatId))
  }, [initial, chatId])

  // The tap is a gesture of the UI thread. A Pressable lost it while a reply streams: the
  // list follows the reply, and a scroll event during the touch hands the touch to the
  // scroll view, which cancels the press.
  const toggle = useCallback(() => setOpen((prev) => !prev), [])
  const pressed = useSharedValue(false)
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .hitSlop(8)
        .maxDistance(10)
        .onBegin(() => {
          pressed.value = true
        })
        .onFinalize(() => {
          pressed.value = false
        })
        .onEnd((_e, success) => {
          if (success) scheduleOnRN(toggle)
        }),
    [pressed, toggle]
  )
  const headStyle = useAnimatedStyle(() => ({ opacity: pressed.value ? 0.6 : 1 }))

  // The lines under the header fold and unfold it too. A press held longer is no tap and
  // is left to the text, which selects; a tap that only clears a selection keeps the
  // thought as it is. In a browser the unfolded text is selected with clicks, so it is
  // left alone there.
  const { shown: shownText, selection, onSelect, touch } = useHeldText(live && open, text)
  const tapLines = useCallback(() => {
    const { selected, clearedAt } = selection.current
    if (selected || Date.now() - clearedAt < SELECTION_CLEAR_MS) return
    setOpen((prev) => !prev)
  }, [])
  const linesTap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(10)
        .maxDuration(LINES_TAP_MS)
        .enabled(!(isWeb && open))
        .onEnd((_e, success) => {
          if (success) scheduleOnRN(tapLines)
        }),
    [tapLines, open]
  )

  const shown = live ? seconds : Math.max(1, Math.round(ms / 1000))
  const tail = text.length > THINKING_TAIL ? `...${text.slice(-THINKING_TAIL).trimStart()}` : text

  return (
    <View style={[styles.thought, !live && !open && styles.thoughtFolded]}>
      <GestureDetector gesture={tap}>
        <Animated.View
          style={[styles.thoughtHead, headStyle]}
          accessible
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onAccessibilityTap={toggle}
        >
          {/* The symbol breathes while the model thinks and settles once the reply starts. */}
          <SFIcon
            name="brain"
            fallback="sparkles-outline"
            size={13}
            color={colors.textMuted}
            effect={{ effect: 'breathe' }}
            active={live}
          />
          {live ? (
            <ShimmerText text={t('message.thinking')} style={styles.thoughtLabel} />
          ) : (
            <Text style={styles.thoughtLabel}>{t('message.reasoning')}</Text>
          )}
          {shown > 0 ? <Text style={styles.thoughtTime}>{shown} {t('message.secondsShort')}</Text> : null}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
        </Animated.View>
      </GestureDetector>
      {open || live ? (
        <GestureDetector gesture={linesTap}>
          <View {...touch}>
            {open ? (
              <SelectableText style={styles.thoughtText} onSelect={onSelect}>
                {shownText}
              </SelectableText>
            ) : (
              <Text style={styles.thoughtText} numberOfLines={4}>
                {tail}
              </Text>
            )}
          </View>
        </GestureDetector>
      ) : null}
    </View>
  )
}

const PICTURE_MAX = { width: 240, height: 300 }
const PICTURE_RADIUS = 18

type PictureProps = { image: MessageImage; group: ImageGroup; index: number; onLongPress: () => void }

function Picture({ image, group, index, onLongPress }: PictureProps) {
  const styles = useStyles(createStyles)
  const uri = useMemo(() => pictureUri(image), [image.file, image.moving])
  const width = image.width || PICTURE_MAX.width
  const height = image.height || PICTURE_MAX.width
  const scale = Math.min(PICTURE_MAX.width / width, PICTURE_MAX.height / height)
  return (
    <ImageLink
      uri={uri}
      aspect={width / height}
      group={group}
      index={index}
      corners={PICTURE_RADIUS}
      onLongPress={onLongPress}
      delayLongPress={LONG_PRESS_MS}
    >
      <Image
        source={{ uri }}
        style={[styles.picture, { width: width * scale, height: height * scale }]}
        contentFit="cover"
      />
    </ImageLink>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  userRow: { alignItems: 'flex-end', paddingLeft: 56, paddingRight: 16, marginVertical: 8, width: '100%', maxWidth: CHAT_COLUMN, alignSelf: 'center' },
  bubble: {
    backgroundColor: colors.bubble,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  picture: { borderRadius: PICTURE_RADIUS, marginBottom: 4, backgroundColor: colors.surface },
  userText: { color: colors.text },
  botRow: { alignItems: 'flex-start', paddingHorizontal: 20, marginVertical: 12, width: '100%', maxWidth: CHAT_COLUMN, alignSelf: 'center' },
  botText: { color: colors.text, letterSpacing: 0.1 },
  action: { fontStyle: 'italic', color: colors.textMuted },
  reactionRow: { marginVertical: 6 },
  speaker: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, maxWidth: '100%' },
  speakerName: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4, maxWidth: '100%' },
  captionEnd: { alignSelf: 'flex-end' },
  captionText: { color: colors.textFaint, fontSize: 12.5, flexShrink: 1 },
  overheard: { marginTop: 6, marginBottom: 0 },
  whisperBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    flexShrink: 1,
  },
  whisperText: { color: colors.textMuted, fontSize: 12, flexShrink: 1 },
  whisperBubble: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, opacity: 0.85 },
  narrationRow: {
    alignItems: 'center',
    paddingHorizontal: 32,
    marginVertical: 14,
    width: '100%',
    maxWidth: CHAT_COLUMN,
    alignSelf: 'center',
  },
  narrationRule: { width: 36, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginVertical: 10 },
  narrationText: { fontStyle: 'italic', color: colors.textMuted, textAlign: 'center' },
  thought: {
    alignSelf: 'stretch',
    marginBottom: 10,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  thoughtFolded: { alignSelf: 'flex-start', borderLeftWidth: 0, paddingLeft: 0 },
  thoughtHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  thoughtLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  thoughtTime: { color: colors.textFaint, fontSize: 13, fontVariant: ['tabular-nums'] },
  thoughtText: { color: colors.textFaint, fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  refineTrigger: { alignSelf: 'flex-start', maxWidth: '100%', marginBottom: 8 },
  refine: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  refineText: { color: colors.textFaint, fontSize: 13, lineHeight: 17, flexShrink: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: -10 },
  barUser: { marginLeft: 0, marginRight: -8 },
  barButton: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
})
