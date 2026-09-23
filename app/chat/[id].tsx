import Ionicons from '@expo/vector-icons/Ionicons'
import * as Clipboard from 'expo-clipboard'
import { LinearGradient } from 'expo-linear-gradient'
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native'
import { KeyboardChatScrollView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { Avatar } from '@/components/Avatar'
import { Composer } from '@/components/Composer'
import { GlassButton, GlassSurface } from '@/components/Glass'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { ImageViewer } from '@/components/ImageViewer'
import { MessageRow, type RowMessage } from '@/components/MessageRow'
import { NativeMenu, type MenuItem } from '@/components/NativeMenu'
import { SFIcon } from '@/components/SFIcon'
import { TextSheet } from '@/components/TextSheet'
import { getCharacter, type Character } from '@/db/characters'
import { createChat, deleteChat, getChat, type Chat } from '@/db/chats'
import { regenerateTargetAt, useChat } from '@/hooks/useChat'
import { useTranslation } from '@/i18n'
import { confirm, promptText, showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import { formatWhen } from '@/lib/format'
import * as Haptics from '@/lib/haptics'
import type { MessageAction } from '@/lib/messageActions'
import { liquidGlass } from '@/lib/nativeUI'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

// How far above the newest message the list has to be before the jump button shows up.
const JUMP_THRESHOLD = 240

export default function ChatScreen() {
  // /chat/new?character=ID creates the chat on arrival. A button can then be a plain
  // Link with a fixed address, which is what the zoom transition needs.
  const { id, character: characterParam } = useLocalSearchParams<{ id: string; character?: string }>()
  const db = useSQLiteContext()
  const router = useRouter()
  const colors = useColors()
  const [loaded, setLoaded] = useState<{ chat: Chat; character: Character } | null>(null)
  // Kept across focus changes, so coming back from the character editor does not
  // start yet another chat.
  const created = useRef<Promise<number> | null>(null)
  // The tap flips the target at once (icon, vignette); the conversation itself is
  // swapped only once the old one has faded out, see ChatView.
  const [privateTarget, setPrivateTarget] = useState(false)
  const [privateMode, setPrivateMode] = useState(false)

  useFocusEffect(
    useCallback(() => {
      ;(async () => {
        let chatId = Number(id)
        if (id === 'new') {
          const owner = await getCharacter(db, Number(characterParam))
          if (!owner) return router.back()
          created.current ??= createChat(db, owner)
          chatId = await created.current
        }
        const chat = await getChat(db, chatId)
        const character = chat && (await getCharacter(db, chat.characterId))
        if (chat && character) setLoaded({ chat, character })
        else router.back()
      })()
    }, [db, id, characterParam, router])
  )

  const togglePrivate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setPrivateTarget((on) => !on)
  }

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  // The private chat lives only in memory: leaving it throws the conversation away and
  // brings back the real chat as it is in the database.
  return (
    <View style={{ flex: 1 }}>
      <ChatView
        chat={loaded.chat}
        character={loaded.character}
        privateMode={privateMode}
        privateTarget={privateTarget}
        onTogglePrivate={togglePrivate}
        onCommitPrivate={setPrivateMode}
      />
      {privateTarget ? <Vignette /> : null}
    </View>
  )
}

// Dark edges closing in on the screen while a private chat is open.
function Vignette() {
  const shade = ['rgba(0, 0, 0, 0.8)', 'rgba(0, 0, 0, 0)'] as const
  return (
    <Animated.View
      entering={FadeIn.duration(450)}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <LinearGradient colors={shade} style={[vignette.edge, vignette.top]} />
      <LinearGradient colors={shade} style={[vignette.edge, vignette.bottom]} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} />
      <LinearGradient colors={shade} style={[vignette.edge, vignette.left]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <LinearGradient colors={shade} style={[vignette.edge, vignette.right]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} />
    </Animated.View>
  )
}

const vignette = StyleSheet.create({
  edge: { position: 'absolute' },
  top: { top: 0, left: 0, right: 0, height: '22%' },
  bottom: { bottom: 0, left: 0, right: 0, height: '28%' },
  left: { top: 0, bottom: 0, left: 0, width: '22%' },
  right: { top: 0, bottom: 0, right: 0, width: '22%' },
})

type ChatViewProps = {
  chat: Chat
  character: Character
  // The conversation shown, and the one the button asks for; they differ mid-switch.
  privateMode: boolean
  privateTarget: boolean
  onTogglePrivate: () => void
  onCommitPrivate: (on: boolean) => void
}

const SWITCH_OUT_MS = 140
const SWITCH_IN_MS = 260

function ChatView({ chat, character, privateMode, privateTarget, onTogglePrivate, onCommitPrivate }: ChatViewProps) {
  const chatId = chat.id
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const {
    messages,
    loaded,
    draft,
    phase,
    error,
    title,
    naming,
    replacingId,
    reasoning,
    reasoningMs,
    send,
    stop,
    regenerate,
    retry,
    proceed,
    selectVariant,
    editMessage,
    removeMessage,
    discard,
    rename,
    autoName,
  } = useChat(chat, character, { ephemeral: privateMode })

  const listRef = useRef<FlatList<RowMessage>>(null)
  const composerHeight = useSharedValue(0)
  // react-native-keyboard-controller's extraContentPadding keeps the list clear of the
  // composer on native; on web that mechanism doesn't reserve any space, so the plain
  // height below drives an explicit padding instead (see contentContainerStyle).
  const [webComposerHeight, setWebComposerHeight] = useState(0)
  const restInset = useRef(0)
  const [editingRow, setEditingRow] = useState<RowMessage | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [awayFromEnd, setAwayFromEnd] = useState(false)
  const keyboard = useReanimatedKeyboardAnimation()

  // Entering private mode is animated: the conversation fades out, the store is swapped
  // while nothing is visible, and the private chat fades in once it has loaded. Leaving
  // it is instant. A second tap during the fade-out cancels it before the swap.
  const contentOpacity = useSharedValue(1)
  const createScale = useSharedValue(1)
  useEffect(() => {
    if (!privateTarget) {
      contentOpacity.value = 1
      createScale.value = 1
      if (privateMode) onCommitPrivate(false)
      return
    }
    if (!privateMode) {
      createScale.value = withSpring(0, { damping: 18, stiffness: 260, overshootClamping: true })
      contentOpacity.value = withTiming(0, { duration: SWITCH_OUT_MS }, (finished) => {
        if (finished) scheduleOnRN(onCommitPrivate, true)
      })
      return
    }
    if (!loaded) return
    // The first frames after the swap go to rendering the new list; a fade started in
    // the same frame would lose them and stutter.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        contentOpacity.value = withTiming(1, { duration: SWITCH_IN_MS, easing: Easing.out(Easing.cubic) })
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [privateTarget, privateMode, loaded, contentOpacity, createScale, onCommitPrivate])
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }))
  // Scaled rather than faded: the button is Liquid Glass too, see the header below.
  const createStyle = useAnimatedStyle(() => ({ transform: [{ scale: createScale.value }] }))

  // Whatever was being edited or looked at belongs to the conversation just left.
  useEffect(() => {
    setEditingRow(null)
    setSelecting(null)
    setViewing(null)
  }, [privateMode])

  // The empty-chat intro stays centered in the space left between the header and the
  // composer, which moves up with the keyboard; the dock is lifted by the keyboard
  // height minus the home indicator inset it already pads for.
  const emptyStyle = useAnimatedStyle(() => ({
    paddingTop: headerHeight,
    paddingBottom: composerHeight.value + Math.max(0, Math.abs(keyboard.height.value) - insets.bottom),
  }))

  const idle = phase === 'idle'
  // Changing the conversation while a reply streams or a message is edited would pull
  // the context out from under it, so only reading actions stay available then.
  const locked = !idle || editingRow !== null

  const regenerable = useMemo(
    () => new Set(messages.filter((_, i) => regenerateTargetAt(messages, i)).map((m) => m.id)),
    [messages]
  )

  // A regenerated reply streams in place of the old one; a new reply streams at the end.
  const rows = useMemo(() => {
    const streaming: RowMessage | null =
      draft === null
        ? null
        : {
            id: -1,
            chatId,
            role: 'assistant',
            content: draft,
            image: null,
            imageWidth: null,
            imageHeight: null,
            variants: [draft],
            variant: 0,
            thoughts: [null],
            createdAt: 0,
            streaming: true,
            reasoning: reasoning ?? undefined,
            reasoningMs,
          }
    const list: RowMessage[] = messages.map((m) => (m.id === replacingId && streaming ? streaming : m))
    if (streaming && replacingId === null) list.push(streaming)
    return list.reverse()
  }, [messages, replacingId, draft, reasoning, reasoningMs, chatId])

  const editing = useMemo(
    () => (editingRow ? { id: editingRow.id, text: editingRow.content } : null),
    [editingRow]
  )

  const scrollToNewest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: -restInset.current, animated: true })
  }, [])

  const onContentInsetChange = useCallback((inset: { top: number }) => {
    restInset.current = inset.top
  }, [])

  // The list is inverted, so the offset grows as the user scrolls back in time.
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setAwayFromEnd(event.nativeEvent.contentOffset.y + restInset.current > JUMP_THRESHOLD)
  }, [])

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

  const onAction = useCallback(
    (message: RowMessage, action: MessageAction) => {
      if (action === 'copy') Clipboard.setStringAsync(message.content)
      else if (action === 'select') setSelecting(message.content)
      else if (action === 'regenerate') regenerate(message.id)
      else if (action === 'refine') {
        promptText({
          title: t('chat.refineTitle'),
          message: t('chat.refineMessage'),
          confirmLabel: t('chat.refineConfirm'),
          onSubmit: (text) => {
            if (text.trim()) regenerate(message.id, text)
          },
        })
      }
      else if (action === 'edit') setEditingRow(message)
      else removeMessage(message.id)
    },
    [regenerate, removeMessage]
  )

  const renderRow = useCallback(
    ({ item: row }: ListRenderItemInfo<RowMessage>) => (
      <MessageRow
        message={row}
        canRegenerate={regenerable.has(row.id)}
        locked={locked}
        onAction={onAction}
        onSelectVariant={selectVariant}
        onOpenImage={setViewing}
      />
    ),
    [regenerable, locked, onAction, selectVariant]
  )

  const confirmDelete = () => {
    confirm({
      title: t('chat.deleteChatTitle'),
      message: t('chat.deleteChatMessage'),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        discard()
        await deleteChat(db, chatId)
        router.back()
      },
    })
  }

  const promptRename = () => {
    promptText({
      title: t('chat.renameChatTitle'),
      message: t('chat.renameChatMessage'),
      initial: title ?? '',
      confirmLabel: t('common.save'),
      onSubmit: (text) => rename(text),
    })
  }

  const suggestName = async () => {
    try {
      if (!(await autoName())) showMessage(t('chat.titleNotFoundTitle'), t('chat.titleNotFoundMessage'))
    } catch (err) {
      showMessage(t('chat.titleFailedTitle'), errorMessage(err))
    }
  }

  const chatMenu: MenuItem[] = [
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: promptRename },
    { label: t('chat.menuSuggestTitle'), systemImage: 'sparkles', onSelect: suggestName },
    { label: t('chat.menuEditCharacter'), systemImage: 'person.crop.circle', onSelect: () => router.push(`/character/${character.id}`) },
    { label: t('chat.menuDeleteChat'), systemImage: 'trash', destructive: true, onSelect: confirmDelete },
  ]

  const errorCard = error ? (
    <View style={styles.error}>
      <Text style={styles.errorText}>{error}</Text>
      <Pressable onPress={retry} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}>
        <Text style={styles.retryText}>{t('chat.retry')}</Text>
      </Pressable>
    </View>
  ) : null

  const empty = loaded && rows.length === 0

  return (
    <View style={styles.screen}>
      <Animated.View style={[StyleSheet.absoluteFill, contentStyle]}>
        <FlatList
          ref={listRef}
          inverted
          data={rows}
          extraData={locked}
          keyExtractor={(row) => (row.streaming ? 'draft' : String(row.id))}
          renderItem={renderRow}
          renderScrollComponent={renderScroll}
          onScroll={onScroll}
          scrollEventThrottle={32}
          ListHeaderComponent={errorCard}
          ListFooterComponent={
            loaded && !empty ? privateMode ? <PrivateIntro /> : <Intro character={character} chat={chat} /> : null
          }
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            // The list is inverted, so this visually sits just above the composer.
            paddingTop: 8 + (Platform.OS === 'web' ? webComposerHeight : 0),
            paddingBottom: headerHeight + 12,
          }}
        />
      </Animated.View>

      {empty ? (
        <Animated.View style={[styles.empty, emptyStyle, contentStyle]} pointerEvents="none">
          {privateMode ? <PrivateIntro hint={t('chat.privateHint')} /> : <Intro character={character} chat={chat} hint={t('chat.emptyHint')} />}
        </Animated.View>
      ) : null}

      <GlassHeader
        floating
        left={
          <GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} />
        }
        right={
          <View style={styles.headerActions}>
            <GlassButton icon={privateTarget ? 'eye-off' : 'eye-off-outline'} onPress={onTogglePrivate}>
              <SFIcon
                name={privateTarget ? 'eye.slash.fill' : 'eye.slash'}
                fallback={privateTarget ? 'eye-off' : 'eye-off-outline'}
                size={20}
                color={colors.text}
                animateChange={privateTarget}
              />
            </GlassButton>
            {/* Stays in the row while hidden, so the eye button next to it does not jump. */}
            <Animated.View style={createStyle} pointerEvents={privateTarget ? 'none' : 'auto'}>
              <Link href={`/chat/new?character=${character.id}`} asChild>
                <Link.AppleZoom>
                  <GlassButton icon="create-outline" />
                </Link.AppleZoom>
              </Link>
            </Animated.View>
          </View>
        }
      >
        {/* Liquid Glass renders wrongly under a parent with opacity below 1 and snaps
            back when it reaches 1, so the pill itself stays put and only its content
            fades. */}
        <NativeMenu items={chatMenu} disabled={privateMode} style={styles.whoPress}>
          <GlassSurface style={[styles.who, liquidGlass && styles.whoPill]}>
            <Animated.View style={[styles.whoContent, contentStyle]}>
              {privateMode ? (
                <>
                  <View style={styles.privateBadge}>
                    <Ionicons name="eye-off" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={styles.name} numberOfLines={1}>
                    {t('chat.privateTitle')}
                  </Text>
                </>
              ) : (
                <>
                  <Avatar name={character.name} file={character.avatar} size={34} />
                  <View style={styles.whoText}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {character.name}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                    </View>
                    {title || naming ? (
                      <Text style={styles.subtitle} numberOfLines={1}>
                        {title ?? t('chat.namingInProgress')}
                      </Text>
                    ) : null}
                  </View>
                </>
              )}
            </Animated.View>
          </GlassSurface>
        </NativeMenu>
      </GlassHeader>

      <Composer
        height={composerHeight}
        onHeightChange={Platform.OS === 'web' ? setWebComposerHeight : undefined}
        generating={!idle}
        editing={editing}
        accessory={
          awayFromEnd ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={styles.jumpSlot}>
              {liquidGlass ? (
                <GlassButton icon="arrow-down" onPress={scrollToNewest} />
              ) : (
                <Pressable onPress={scrollToNewest} hitSlop={8} style={({ pressed }) => [styles.jump, pressed && { opacity: 0.7 }]}>
                  <Ionicons name="arrow-down" size={18} color={colors.text} />
                </Pressable>
              )}
            </Animated.View>
          ) : null
        }
        onSend={(text, image) => {
          send(text, image)
          scrollToNewest()
        }}
        onStop={stop}
        onContinue={
          messages.length
            ? () => {
                proceed()
                scrollToNewest()
              }
            : undefined
        }
        onSubmitEdit={async (text) => {
          if (editingRow) await editMessage(editingRow.id, text)
          setEditingRow(null)
        }}
        onCancelEdit={() => setEditingRow(null)}
      />

      <TextSheet text={selecting} onClose={() => setSelecting(null)} />
      <ImageViewer uri={viewing} onClose={() => setViewing(null)} />
    </View>
  )
}

function Intro({ character, chat, hint }: { character: Character; chat: Chat; hint?: string }) {
  const styles = useStyles(createStyles)
  const { locale } = useTranslation()
  return (
    <View style={styles.intro}>
      <Avatar name={character.name} file={character.avatar} size={72} />
      <Text style={styles.introName}>{character.name}</Text>
      <Text style={styles.introMeta}>{hint ?? formatWhen(chat.createdAt, locale)}</Text>
    </View>
  )
}

function PrivateIntro({ hint }: { hint?: string }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  return (
    <View style={styles.intro}>
      <View style={styles.privateAvatar}>
        <Ionicons name="eye-off" size={30} color={colors.textMuted} />
      </View>
      <Text style={styles.introName}>{t('chat.privateTitle')}</Text>
      {hint ? <Text style={styles.introMeta}>{hint}</Text> : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  whoPress: { alignSelf: 'flex-start', maxWidth: '100%' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whoContent: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  whoPill: { borderRadius: 22, paddingVertical: 4, paddingLeft: 4, paddingRight: 14 },
  whoText: { flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  privateBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  privateAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flexShrink: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 18, fontWeight: '600' },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 1 },
  intro: { alignItems: 'center', paddingTop: 24, paddingBottom: 20, paddingHorizontal: 32 },
  introName: { color: colors.text, fontFamily: fonts.prose, fontSize: 22, marginTop: 12 },
  introMeta: { color: colors.textFaint, fontSize: 14, marginTop: 4, textAlign: 'center' },
  empty: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  jumpSlot: { marginBottom: 12 },
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
})
