import Ionicons from '@expo/vector-icons/Ionicons'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import { memo, useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import type { Message } from '@/db/messages'
import { useTranslation } from '@/i18n'
import { showSheet } from '@/lib/dialogs'
import * as Haptics from '@/lib/haptics'
import { imageDataUrl } from '@/lib/images'
import { messageActions, type MessageAction } from '@/lib/messageActions'
import { splitRoleplay } from '@/lib/roleplay'
import { CHAT_MAX_WIDTH, fonts, useColors, useStyles, type Colors } from '@/theme'

import { IconButton } from './IconButton'
import { NativeMenu } from './NativeMenu'
import { SFIcon } from './SFIcon'
import { TypingIndicator } from './TypingIndicator'

// The live draft also carries what a reasoning model is thinking; reasoningMs is set
// once the thinking is over and the reply has started.
export type RowMessage = Message & { streaming?: boolean; reasoning?: string; reasoningMs?: number | null }

type Props = {
  message: RowMessage
  canRegenerate: boolean
  locked: boolean
  onAction: (message: RowMessage, action: MessageAction) => void
  onSelectVariant: (id: number, variant: number) => void
  onOpenImage: (uri: string) => void
}

// On iOS a long press opens the message menu, which would fight with native text
// selection; there the menu offers a separate sheet for selecting text instead.
const SELECTABLE = Platform.OS === 'web'
const LONG_PRESS_MS = 350

function MessageRowView({ message, canRegenerate, locked, onAction, onSelectVariant, onOpenImage }: Props) {
  const styles = useStyles(createStyles)
  const isUser = message.role === 'user'
  const spans = useMemo(() => (isUser ? [] : splitRoleplay(message.content)), [isUser, message.content])
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

  if (isUser) {
    return (
      <View style={styles.userRow}>
        {message.image ? <Picture message={message} onOpen={onOpenImage} onLongPress={openSheet} /> : null}
        {message.content ? (
          <Pressable onLongPress={openSheet} delayLongPress={LONG_PRESS_MS} style={styles.bubble}>
            <Text selectable={SELECTABLE} style={styles.userText}>
              {message.content}
            </Text>
          </Pressable>
        ) : null}
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
  return (
    <View style={styles.botRow}>
      {thought ? <ThoughtBlock text={thought.text} ms={thought.ms} /> : null}
      {waiting && thought ? null : waiting ? (
        <TypingIndicator />
      ) : (
        <Pressable onLongPress={openSheet} delayLongPress={LONG_PRESS_MS}>
          <Text selectable={SELECTABLE} style={styles.botText}>
            {spans.map((span, i) => (
              <Text key={i} style={span.action ? styles.action : undefined}>
                {span.text}
              </Text>
            ))}
          </Text>
        </Pressable>
      )}
      {bar}
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
          <SFIcon name="ellipsis" fallback="ellipsis-horizontal" size={15} color={colors.textFaint} />
        </NativeMenu>
      ) : null}
      {count > 1 ? (
        <View style={styles.pager}>
          <IconButton
            name="chevron-back"
            size={16}
            color={colors.textMuted}
            disabled={locked || message.variant === 0}
            onPress={() => onSelectVariant(message.id, message.variant - 1)}
            style={styles.pagerButton}
          />
          <Text style={styles.pagerText}>
            {message.variant + 1} / {count}
          </Text>
          <IconButton
            name="chevron-forward"
            size={16}
            color={colors.textMuted}
            disabled={locked || message.variant === count - 1}
            onPress={() => onSelectVariant(message.id, message.variant + 1)}
            style={styles.pagerButton}
          />
        </View>
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
function ThoughtBlock({ text, ms }: ThoughtProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const live = ms === null

  useEffect(() => {
    if (!live) return
    const start = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [live])

  const shown = live ? seconds : Math.max(1, Math.round(ms / 1000))
  const tail = text.length > THINKING_TAIL ? `...${text.slice(-THINKING_TAIL).trimStart()}` : text

  return (
    <View style={[styles.thought, !live && !open && styles.thoughtFolded]}>
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        hitSlop={8}
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
        <Text style={styles.thoughtLabel}>{live ? t('message.thinking') : t('message.reasoning')}</Text>
        {shown > 0 ? <Text style={styles.thoughtTime}>{shown} {t('message.secondsShort')}</Text> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
      </Pressable>
      {open ? (
        <Text selectable style={styles.thoughtText}>
          {text}
        </Text>
      ) : live ? (
        <Text style={styles.thoughtText} numberOfLines={4}>
          {tail}
        </Text>
      ) : null}
    </View>
  )
}

const PICTURE_MAX = { width: 240, height: 300 }

type PictureProps = { message: RowMessage; onOpen: (uri: string) => void; onLongPress: () => void }

function Picture({ message, onOpen, onLongPress }: PictureProps) {
  const styles = useStyles(createStyles)
  const uri = useMemo(() => imageDataUrl(message.image ?? ''), [message.image])
  const width = message.imageWidth || PICTURE_MAX.width
  const height = message.imageHeight || PICTURE_MAX.width
  const scale = Math.min(PICTURE_MAX.width / width, PICTURE_MAX.height / height)
  return (
    <Pressable onPress={() => onOpen(uri)} onLongPress={onLongPress} delayLongPress={LONG_PRESS_MS}>
      <Image
        source={{ uri }}
        style={[styles.picture, { width: width * scale, height: height * scale }]}
        contentFit="cover"
      />
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  // maxWidth is a no-op on any phone-width screen; it only kicks in once the desktop
  // pane is wide enough that a full-bleed bubble would otherwise be hard to read.
  userRow: { alignItems: 'flex-end', paddingLeft: 56, paddingRight: 16, marginVertical: 8, width: '100%', maxWidth: CHAT_MAX_WIDTH, alignSelf: 'center' },
  bubble: {
    backgroundColor: colors.bubble,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  picture: { borderRadius: 18, marginBottom: 4, backgroundColor: colors.surface },
  userText: { color: colors.text, fontSize: 16, lineHeight: 22 },
  botRow: { alignItems: 'flex-start', paddingHorizontal: 20, marginVertical: 12, width: '100%', maxWidth: CHAT_MAX_WIDTH, alignSelf: 'center' },
  botText: { color: colors.text, fontFamily: fonts.prose, fontSize: 17, lineHeight: 27, letterSpacing: 0.1 },
  action: { fontStyle: 'italic', color: colors.textMuted },
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
  pager: { flexDirection: 'row', alignItems: 'center', marginLeft: 6 },
  pagerButton: { width: 28, height: 32 },
  pagerText: { color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'center' },
})
