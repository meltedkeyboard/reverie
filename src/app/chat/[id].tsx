import { Icon } from '@/components/visuals/Icon'
import * as Clipboard from 'expo-clipboard'
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AsideToggleButton, ChatSurface, bubbleOpacityOf } from '@/components/chrome/ChatChrome'
import { AsidePanel } from '@/components/chat/AsidePanel'
import { Avatar } from '@/components/visuals/Avatar'
import { Composer, ComposerFloat, ComposerSwap } from '@/components/chat/Composer'
import { ConversationList, ErrorCard, JumpButton } from '@/components/chat/ConversationList'
import { GlassButton, GlassSurface } from '@/components/chrome/Glass'
import { GlassHeader, useHeaderHeight } from '@/components/chrome/GlassHeader'
import { MessageRow, type RowMessage } from '@/components/chat/MessageRow'
import { NativeMenu, nativeMenuGlass, type MenuItem } from '@/components/overlays/NativeMenu'
import { RoomView } from '@/components/cast/RoomView'
import { ShimmerText } from '@/components/visuals/ShimmerText'
import { getCharacter, type Character } from '@/db/characters'
import { createChat, getChat, type Chat } from '@/db/chats'
import { setContinueHidden, setLastOpened } from '@/db/prefs/continue'
import { newMessage } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { createRoomChat, getRoom, listRoomMembers, type Room, type RoomMember } from '@/db/rooms'
import { useAside } from '@/hooks/chat/useAside'
import { regenerateTargetAt, useChat } from '@/hooks/chat/useChat'
import { useLayoutMode } from '@/hooks/util/useLayoutMode'
import { useChatMenuActions, useMessageActions } from '@/hooks/chat/useChatScreenActions'
import { useChatShell } from '@/hooks/chat/useChatShell'
import { useChatSwitches } from '@/hooks/util/useStoredFlag'
import { useSuggestion } from '@/hooks/chat/useSuggestion'
import { useTranslation } from '@/i18n'
import { characterScene } from '@/lib/chat/aside'
import { formatWhen } from '@/lib/core/format'
import * as Haptics from '@/lib/ui/haptics'
import { showToastOnce } from '@/lib/ui/toast'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { fonts, HEADER_FONT_SCALE, useColors, useStyles, type Colors } from '@/theme'

type Loaded =
  | { kind: 'character'; chat: Chat; character: Character }
  | { kind: 'room'; chat: Chat; room: Room; members: RoomMember[] }

export default function ChatScreen() {
  // /chat/new?character=ID (or ?room=ID for a scene) creates the chat on arrival. A
  // button can then be a plain Link with a fixed address, which is what the zoom
  // transition needs.
  const { id, character: characterParam, room: roomParam, message: messageParam } = useLocalSearchParams<{
    id: string
    character?: string
    room?: string
    // /chat/ID?message=ID opens the chat at that message, as search does.
    message?: string
  }>()
  const db = useDatabase()
  const router = useRouter()
  const colors = useColors()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // Kept across focus changes, so coming back from the character editor does not
  // start yet another chat.
  const created = useRef<Promise<number> | null>(null)

  useFocusEffect(
    useCallback(() => {
      ;(async () => {
        let chatId = Number(id)
        if (id === 'new' && roomParam) {
          const room = await getRoom(db, Number(roomParam))
          if (!room) return router.back()
          created.current ??= createRoomChat(db, room)
          chatId = await created.current
        } else if (id === 'new') {
          const owner = await getCharacter(db, Number(characterParam))
          if (!owner) return router.back()
          created.current ??= createChat(db, owner)
          chatId = await created.current
        }
        const chat = await getChat(db, chatId)
        if (chat?.roomId) {
          // Re-read on every focus: the room or its cast may have been edited meanwhile.
          const room = await getRoom(db, chat.roomId)
          if (!room) return router.back()
          setLoaded({ kind: 'room', chat, room, members: await listRoomMembers(db, room.id) })
          setContinueHidden(db, 'room', false)
          setLastOpened(db, 'room', chat.id)
          return
        }
        const character = chat?.characterId ? await getCharacter(db, chat.characterId) : null
        if (chat && character) {
          setLoaded({ kind: 'character', chat, character })
          // A continue button swiped away on the home screen comes back once a chat opens.
          setContinueHidden(db, 'character', false)
          setLastOpened(db, 'character', chat.id)
        } else router.back()
      })()
    }, [db, id, characterParam, roomParam, router])
  )

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  const focusMessageId = messageParam ? Number(messageParam) : null
  if (loaded.kind === 'room') {
    return <RoomView chat={loaded.chat} room={loaded.room} members={loaded.members} focusMessageId={focusMessageId} />
  }
  return <ChatView chat={loaded.chat} character={loaded.character} focusMessageId={focusMessageId} />
}

type ChatViewProps = {
  chat: Chat
  character: Character
  focusMessageId: number | null
}

function ChatView({ chat, character, focusMessageId }: ChatViewProps) {
  const chatId = chat.id
  const db = useDatabase()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  // The sidebar is the way out of a chat in a wide window.
  const wide = useLayoutMode() === 'wide'
  const { privateEnabled, suggestEnabled } = useChatSwitches()
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
  const scene = useMemo(() => characterScene(character), [character])
  const aside = useAside(scene, messages)

  const [editingRow, setEditingRow] = useState<RowMessage | null>(null)
  const [awayFromEnd, setAwayFromEnd] = useState(false)
  // The eye in the header opens a private thread with the model about this chat.
  const { listRef, composerHeight, composerTop, asideOpen, toggleAside, sceneDraft, emptyStyle, scrollToNewest } = useChatShell(aside, () => setEditingRow(null))

  const idle = phase === 'idle'
  const [suggestion, clearSuggestion, dismissSuggestion] = useSuggestion(scene, messages, suggestEnabled && idle && !asideOpen && !editingRow)
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
            ...newMessage(-1, chatId, 'assistant', draft, {}, 0),
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

  const onAction = useMessageActions({ regenerate, removeMessage, edit: setEditingRow })
  const { confirmDelete, promptRename, suggestName } = useChatMenuActions({ chatId, title, rename, autoName, discard })

  // Over a chat background the user's bubbles can be made see-through.
  const bubbleOpacity = bubbleOpacityOf(character)
  const renderRow = useCallback(
    (row: RowMessage) => (
      <MessageRow
        message={row}
        canRegenerate={regenerable.has(row.id)}
        locked={locked}
        onAction={onAction}
        onSelectVariant={selectVariant}
        bubbleOpacity={bubbleOpacity}
      />
    ),
    [regenerable, locked, onAction, selectVariant, bubbleOpacity]
  )

  const chatMenu: MenuItem[] = [
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: promptRename },
    { label: t('chat.menuSuggestTitle'), systemImage: 'sparkles', onSelect: suggestName },
    { label: t('chat.menuShowProfile'), systemImage: 'person.crop.circle', onSelect: () => router.push(`/character/${character.id}?profile=1`) },
    { label: t('chat.menuDeleteChat'), systemImage: 'trash', destructive: true, onSelect: confirmDelete },
  ]

  const asidePanel = asideOpen ? (
    <AsidePanel
      turns={aside.turns}
      pending={aside.pending}
      draft={aside.draft}
      phase={aside.phase}
      error={aside.error}
      composerHeight={composerHeight}
      onRetry={aside.retry}
      onClose={toggleAside}
    />
  ) : null

  const errorCard = error ? <ErrorCard message={error} onRetry={retry} /> : null

  const empty = loaded && rows.length === 0
  // Nothing written yet: a new chat from here would be the same as this one.
  const fresh = loaded && !rows.some((r) => r.role === 'user')

  return (
    <View style={styles.screen}>
      <ChatSurface owner={character} />
      <View style={StyleSheet.absoluteFill}>
        <ConversationList
          ref={listRef}
          rows={rows}
          renderRow={renderRow}
          extraData={locked}
          composerHeight={composerHeight}
          header={errorCard}
          footer={loaded && !empty ? <Intro character={character} chat={chat} /> : null}
          onAwayChange={setAwayFromEnd}
          focusId={focusMessageId}
        />
      </View>

      {empty ? (
        <Animated.View style={[styles.empty, emptyStyle]} pointerEvents="none">
          <Intro character={character} chat={chat} hint={t('chat.emptyHint')} />
        </Animated.View>
      ) : null}

      <GlassHeader
        floating
        left={wide ? undefined : <GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} />}
        right={
          <View style={styles.headerActions}>
            <AsideToggleButton open={asideOpen} enabled={privateEnabled} onPress={toggleAside} />
            {fresh ? (
              <GlassButton icon="create-outline" onPress={() => showToastOnce({ title: t('chat.alreadyNew'), tone: 'info' })} />
            ) : (
              <Link href={`/chat/new?character=${character.id}`} asChild>
                <GlassButton icon="create-outline" />
              </Link>
            )}
          </View>
        }
      >
        <View style={styles.headerWho}>
          {/* The photo is a button of its own, as in Telegram: it opens full screen, and
              the pill beside it keeps the menu. */}
          <GlassSurface interactive style={styles.photo}>
            <Avatar name={character.name} file={character.avatar} size={38} />
          </GlassSurface>
          {/* When the menu can, it draws the pill's glass itself, so the menu morphs out
              of the pill. */}
          <NativeMenu items={chatMenu} style={styles.whoPress} glassRadius={22}>
            <PillSurface style={[styles.who, liquidGlass && styles.whoPill]}>
              <View style={styles.whoText}>
                <View style={styles.nameRow}>
                  <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.name} numberOfLines={1}>
                    {character.name}
                  </Text>
                  <Icon name="chevron-down" size={14} color={colors.textMuted} />
                </View>
                {naming ? (
                  <ShimmerText maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.subtitle} text={title ?? t('chat.namingInProgress')} />
                ) : title ? (
                  <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.subtitle} numberOfLines={1}>
                    {title}
                  </Text>
                ) : null}
              </View>
            </PillSurface>
          </NativeMenu>
        </View>
      </GlassHeader>

      {/* With the private thread open the field talks to the model aside, and the thread
          takes the accessory slot so it rides the keyboard with the field. */}
      <ComposerSwap id={asideOpen ? 'aside' : 'scene'}>
        <Composer
          height={composerHeight}
          initialText={asideOpen ? undefined : sceneDraft.current}
          onTextChange={asideOpen ? undefined : (text) => (sceneDraft.current = text)}
          autoFocus={asideOpen}
          generating={asideOpen ? aside.phase !== 'idle' : !idle}
          editing={asideOpen ? null : editing}
          top={composerTop}
          accessory={asidePanel}
          placeholder={asideOpen ? t('chat.privatePlaceholder') : undefined}
          hushed={asideOpen}
          suggestion={suggestion}
          onSuggestionTaken={clearSuggestion}
          onSuggestionDismissed={dismissSuggestion}
          onSend={(text, image) => {
            if (asideOpen) return void aside.ask(text, image)
            send(text, image)
            scrollToNewest()
          }}
          onStop={asideOpen ? aside.stop : stop}
          onContinue={
            messages.length && !asideOpen
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
      </ComposerSwap>
      {/* Outside the swap, so it neither sinks with the field nor goes missing in Private. */}
      <ComposerFloat top={composerTop}>
        <JumpButton visible={awayFromEnd} onPress={() => listRef.current?.jumpToNewest()} />
      </ComposerFloat>
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

const PillSurface = nativeMenuGlass ? View : GlassSurface

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerWho: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  whoPress: { flexShrink: 1 },
  who: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  whoPill: { borderRadius: 22, paddingVertical: 4, paddingHorizontal: 16 },
  whoText: { flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flexShrink: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 18, fontWeight: '600' },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 1 },
  intro: { alignItems: 'center', paddingTop: 24, paddingBottom: 20, paddingHorizontal: 32 },
  introName: { color: colors.text, fontFamily: fonts.prose, fontSize: 22, marginTop: 12 },
  introMeta: { color: colors.textFaint, fontSize: 14, marginTop: 4, textAlign: 'center' },
  empty: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
})
