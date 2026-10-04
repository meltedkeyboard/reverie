import Ionicons from '@expo/vector-icons/Ionicons'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import { memo, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { Message } from '@/db/messages'
import { useElapsedSeconds } from '@/hooks/useElapsedSeconds'
import { CHAT_COLUMN } from '@/hooks/useLayoutMode'
import { useTranslation } from '@/i18n'
import type { MessageImage } from '@/db/messages'
import { withAlpha } from '@/lib/color'
import { showSheet } from '@/lib/dialogs'
import { PRESS_ANYWHERE } from '@/lib/press'
import * as Haptics from '@/lib/haptics'
import { pictureUri } from '@/lib/attachments'
import { CHAT_METRICS, useChatText } from '@/lib/chatText'
import { messageActions, type MessageAction } from '@/lib/messageActions'
import { useColors, useStyles, type Colors } from '@/theme'

import { Avatar } from './Avatar'
import { IconButton } from './IconButton'
import { ImageLink } from './ImageLink'
import { Markdown, SelectableText } from './Markdown'
import { NativeMenu } from './NativeMenu'
import { Pager } from './Pager'
import { SFIcon } from './SFIcon'
import { ShimmerText } from './ShimmerText'
import { TypingIndicator } from './TypingIndicator'

// The live draft also carries what a reasoning model is thinking; reasoningMs is set
// once the thinking is over and the reply has started.
export type RowMessage = Message & { streaming?: boolean; reasoning?: string; reasoningMs?: number | null }

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
}

// The family and scaled size a line of chat text takes from the settings.
function textSize({ fontFamily, scaled }: ReturnType<typeof useChatText>, metrics: { size: number; line: number }) {
  return { fontFamily, fontSize: scaled(metrics.size), lineHeight: scaled(metrics.line) }
}

// A long press on the user's own bubble opens the message menu. Replies have no such
// menu: a long press there selects text, and their actions sit in the bar below.
const LONG_PRESS_MS = 350

function MessageRowView({ message, canRegenerate, locked, onAction, onSelectVariant, bubbleOpacity = 1, scene }: Props) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const chatText = useChatText()
  const narration = message.kind === 'narration'
  const isUser = message.role === 'user' && !narration
  const actions = useMemo(
    () => messageActions(message, { canRegenerate, locked }),
    [message, canRegenerate, locked]
  )

  const openSheet = () => {
    if (message.streaming) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    showSheet(
      undefined,
      actions.map((item) => ({ ...item, onSelect: () => onAction(message, item.action) }))
    )
  }

  const bar = message.streaming ? null : (
    <ActionBar
      message={message}
      actions={actions}
      onAction={onAction}
      onSelectVariant={onSelectVariant}
      locked={locked}
    />
  )

  const text = (
    <Markdown
      text={message.content}
      style={
        narration
          ? [styles.botText, styles.narrationText, textSize(chatText, CHAT_METRICS.narration)]
          : [styles.botText, textSize(chatText, CHAT_METRICS.bot)]
      }
      emStyle={styles.action}
      streaming={message.streaming}
    />
  )

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
            <Ionicons name={scene.whisper ? 'lock-closed' : 'arrow-forward'} size={11} color={colors.textFaint} />
            <Text style={styles.captionText} numberOfLines={1}>
              {scene.whisper ? t('room.whisperTo', { names: scene.whisper }) : scene.to}
            </Text>
          </View>
        ) : null}
        {message.images.map((image, index) => (
          <Picture key={index} image={image} onLongPress={openSheet} />
        ))}
        {message.content ? (
          <Pressable onLongPress={openSheet} delayLongPress={LONG_PRESS_MS} pressRetentionOffset={PRESS_ANYWHERE}
            style={[
              styles.bubble,
              bubbleOpacity < 1 && { backgroundColor: withAlpha(colors.bubble, bubbleOpacity) },
              scene?.whisper ? styles.whisperBubble : null,
            ]}
          >
            {chatText.userMarkdown ? (
              <Markdown
                text={message.content}
                style={[styles.userText, textSize(chatText, CHAT_METRICS.user), { fontFamily: chatText.userFontFamily }]}
                selectable={false}
              />
            ) : (
              <Text style={[styles.userText, textSize(chatText, CHAT_METRICS.user), { fontFamily: chatText.userFontFamily }]}>
                {message.content}
              </Text>
            )}
          </Pressable>
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
  const speaker = scene?.speaker
  return (
    <View style={[styles.botRow, message.kind === 'reaction' && styles.reactionRow]}>
      {scene ? (
        <View style={styles.speaker}>
          {speaker ? <Avatar name={speaker.name} file={speaker.avatar} size={22} /> : null}
          <Text style={[styles.speakerName, { color: speaker?.color ?? colors.textFaint }]} numberOfLines={1}>
            {speaker?.name ?? t('room.deletedCharacter')}
          </Text>
          {scene.to && !scene.whisper ? (
            <>
              <Ionicons name="arrow-forward" size={11} color={colors.textFaint} />
              <Text style={styles.captionText} numberOfLines={1}>
                {scene.to}
              </Text>
            </>
          ) : null}
          {scene.whisper ? (
            <View style={styles.whisperBadge}>
              <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
              <Text style={styles.whisperText} numberOfLines={1}>
                {t('room.whisperTo', { names: scene.whisper })}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {thought ? <ThoughtBlock text={thought.text} ms={thought.ms} /> : null}
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
      <Ionicons name="ear-outline" size={13} color={colors.textFaint} />
      <Text style={styles.captionText} numberOfLines={1}>
        {t('room.overheardBy', { names })}
      </Text>
    </View>
  )
}

export const MessageRow = memo(MessageRowView)

type ActionBarProps = {
  message: RowMessage
  actions: ReturnType<typeof messageActions>
  locked: boolean
  onAction: (message: RowMessage, action: MessageAction) => void
  onSelectVariant: (id: number, variant: number) => void
}

// The main action gets its own button next to copy: regenerating for a reply, editing
// for the user's own message. Everything else goes into the ellipsis menu.
function ActionBar({ message, actions, locked, onAction, onSelectVariant }: ActionBarProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const [copied, setCopied] = useState(false)
  // Each press bumps its counter, which plays the symbol animation once.
  const [copies, setCopies] = useState(0)
  const [spins, setSpins] = useState(0)
  const isUser = message.role === 'user'
  const primary = isUser ? 'edit' : 'regenerate'
  const hasPrimary = actions.some((item) => item.action === primary)
  const menu = actions
    .filter((item) => item.action !== 'copy' && item.action !== primary)
    .map((item) => ({ ...item, onSelect: () => onAction(message, item.action) }))
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
          <SFIcon
            name={copied ? 'checkmark' : 'square.on.square'}
            fallback={copied ? 'checkmark' : 'copy-outline'}
            size={15}
            color={copied ? colors.success : colors.textFaint}
            effect={{ effect: 'bounce' }}
            trigger={copies}
          />
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
          <SFIcon
            name={isUser ? 'square.and.pencil' : 'arrow.clockwise'}
            fallback={isUser ? 'create-outline' : 'refresh'}
            size={15}
            color={colors.textFaint}
            effect={isUser ? { effect: 'bounce' } : { effect: 'rotate', direction: 'clockwise' }}
            trigger={spins}
          />
        </IconButton>
      ) : null}
      {menu.length ? (
        <NativeMenu items={menu} style={styles.barButton}>
          {/* A plain glyph: a SwiftUI symbol inside the menu's label gets the accent tint. */}
          <Ionicons name="ellipsis-horizontal" size={17} color={colors.textFaint} />
        </NativeMenu>
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

// Roughly four lines on a phone: enough to see the model is working, not a wall of text.
const THINKING_TAIL = 220

type ThoughtProps = {
  text: string
  // Null while the model is still thinking.
  ms: number | null
}

// Folded by default like in ChatGPT and Claude. While the model thinks, the folded block
// shows the latest lines so it is clear something is happening; afterwards only the
// header stays, and a tap unfolds the whole reasoning either way.
export function ThoughtBlock({ text, ms }: ThoughtProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const live = ms === null
  const seconds = useElapsedSeconds(live)

  const shown = live ? seconds : Math.max(1, Math.round(ms / 1000))
  const tail = text.length > THINKING_TAIL ? `...${text.slice(-THINKING_TAIL).trimStart()}` : text

  return (
    <View style={[styles.thought, !live && !open && styles.thoughtFolded]}>
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        hitSlop={8}
        pressRetentionOffset={PRESS_ANYWHERE}
        style={({ pressed }) => [styles.thoughtHead, pressed && { opacity: 0.6 }]}
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
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
      </Pressable>
      {open ? (
        <SelectableText style={styles.thoughtText}>{text}</SelectableText>
      ) : live ? (
        <Text style={styles.thoughtText} numberOfLines={4}>
          {tail}
        </Text>
      ) : null}
    </View>
  )
}

const PICTURE_MAX = { width: 240, height: 300 }

type PictureProps = { image: MessageImage; onLongPress: () => void }

function Picture({ image, onLongPress }: PictureProps) {
  const styles = useStyles(createStyles)
  const uri = useMemo(() => pictureUri(image), [image.file, image.moving])
  const width = image.width || PICTURE_MAX.width
  const height = image.height || PICTURE_MAX.width
  const scale = Math.min(PICTURE_MAX.width / width, PICTURE_MAX.height / height)
  return (
    <ImageLink uri={uri} aspect={width / height} onLongPress={onLongPress} delayLongPress={LONG_PRESS_MS}>
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
  picture: { borderRadius: 18, marginBottom: 4, backgroundColor: colors.surface },
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
  bar: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: -10 },
  barUser: { marginLeft: 0, marginRight: -8 },
  barButton: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
})
