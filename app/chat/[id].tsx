import Ionicons from '@expo/vector-icons/Ionicons'
import * as Clipboard from 'expo-clipboard'
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  FlatList,
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
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '@/components/Avatar'
import { Composer } from '@/components/Composer'
import { GlassButton, GlassSurface } from '@/components/Glass'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { ImageViewer } from '@/components/ImageViewer'
import { MessageRow, type RowMessage } from '@/components/MessageRow'
import { NativeMenu, type MenuItem } from '@/components/NativeMenu'
import { TextSheet } from '@/components/TextSheet'
import { getCharacter, type Character } from '@/db/characters'
import { createChat, deleteChat, getChat, type Chat } from '@/db/chats'
import { regenerateTargetAt, useChat } from '@/hooks/useChat'
import { useTranslation } from '@/i18n'
import { confirm, promptText, showMessage } from '@/lib/dialogs'
import { formatWhen } from '@/lib/format'
import type { MessageAction } from '@/lib/messageActions'
import { liquidGlass } from '@/lib/nativeUI'
import { fonts, useColors } from '@/theme'

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

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  return <ChatView chat={loaded.chat} character={loaded.character} />
}

function ChatView({ chat, character }: { chat: Chat; character: Character }) {
  const chatId = chat.id
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
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
  } = useChat(chat, character)

  const listRef = useRef<FlatList<RowMessage>>(null)
  const composerHeight = useSharedValue(0)
  const restInset = useRef(0)
  const [editingRow, setEditingRow] = useState<RowMessage | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [awayFromEnd, setAwayFromEnd] = useState(false)
  const keyboard = useReanimatedKeyboardAnimation()

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
      showMessage(t('chat.titleFailedTitle'), err instanceof Error ? err.message : String(err))
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
        ListFooterComponent={loaded && !empty ? <Intro character={character} chat={chat} /> : null}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: headerHeight + 12 }}
      />

      {empty ? (
        <Animated.View style={[styles.empty, emptyStyle]} pointerEvents="none">
          <Intro character={character} chat={chat} hint={t('chat.emptyHint')} />
        </Animated.View>
      ) : null}

      <GlassHeader
        floating
        left={
          <GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} />
        }
        right={
          <Link href={`/chat/new?character=${character.id}`} asChild>
            <Link.AppleZoom>
              <GlassButton icon="create-outline" />
            </Link.AppleZoom>
          </Link>
        }
      >
        <NativeMenu items={chatMenu} style={styles.whoPress}>
          <GlassSurface style={[styles.who, liquidGlass && styles.whoPill]}>
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
          </GlassSurface>
        </NativeMenu>
      </GlassHeader>

      <Composer
        height={composerHeight}
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
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { locale } = useTranslation()
  return (
    <View style={styles.intro}>
      <Avatar name={character.name} file={character.avatar} size={72} />
      <Text style={styles.introName}>{character.name}</Text>
      <Text style={styles.introMeta}>{hint ?? formatWhen(chat.createdAt, locale)}</Text>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  whoPress: { alignSelf: 'flex-start', maxWidth: '100%' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whoPill: { borderRadius: 22, paddingVertical: 4, paddingLeft: 4, paddingRight: 14 },
  whoText: { flexShrink: 1 },
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
    backgroundColor: 'rgba(240, 97, 109, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(240, 97, 109, 0.3)',
  },
  errorText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  retry: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  retryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
})
