import Ionicons from '@expo/vector-icons/Ionicons'
import * as Clipboard from 'expo-clipboard'
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AsidePanel } from '@/components/AsidePanel'
import { Avatar } from '@/components/Avatar'
import { castGallery } from '@/components/AvatarStack'
import { ChatBackground } from '@/components/ChatBackground'
import { Composer, ComposerSwap } from '@/components/Composer'
import { ConversationList, ErrorCard, JumpButton, type ConversationHandle } from '@/components/ConversationList'
import { GlassButton, GlassSurface } from '@/components/Glass'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { useOpenViewer } from '@/components/ImageLink'
import { MessageRow, type RowMessage } from '@/components/MessageRow'
import { NativeMenu, nativeMenuGlass, type MenuItem } from '@/components/NativeMenu'
import { RoomView } from '@/components/RoomView'
import { SFIcon } from '@/components/SFIcon'
import { TextSheet } from '@/components/TextSheet'
import { getCharacter, type Character } from '@/db/characters'
import { createChat, deleteChat, getChat, type Chat } from '@/db/chats'
import { setContinueHidden, setLastOpened } from '@/db/continue'
import { newMessage } from '@/db/messages'
import { isPrivateChatEnabled } from '@/db/privateChat'
import { useDatabase } from '@/db/provider'
import { createRoomChat, getRoom, listRoomMembers, type Room, type RoomMember } from '@/db/rooms'
import { useAside } from '@/hooks/useAside'
import { regenerateTargetAt, useChat } from '@/hooks/useChat'
import { useTranslation } from '@/i18n'
import { characterScene } from '@/lib/aside'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chatDialogs'
import { promptText, showMessage } from '@/lib/dialogs'
import { avatarUri } from '@/lib/avatars'
import { errorMessage } from '@/lib/errors'
import { formatWhen } from '@/lib/format'
import * as Haptics from '@/lib/haptics'
import type { MessageAction } from '@/lib/messageActions'
import { liquidGlass } from '@/lib/nativeUI'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

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
  const openViewer = useOpenViewer()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [privateEnabled, setPrivateEnabled] = useState(true)
  useEffect(() => {
    isPrivateChatEnabled(db).then(setPrivateEnabled)
  }, [db])
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
  // The eye in the header opens a private thread with the model about this chat, like
  // /btw: the model reads the conversation and answers aside, and nothing of it is kept.
  const [asideOpen, setAsideOpen] = useState(false)
  // What was typed to the characters waits here while the field asks the model aside.
  const sceneDraft = useRef('')
  const scene = useMemo(() => characterScene(character), [character])
  const aside = useAside(scene, messages)

  const listRef = useRef<ConversationHandle>(null)
  const composerHeight = useSharedValue(0)
  const [editingRow, setEditingRow] = useState<RowMessage | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [awayFromEnd, setAwayFromEnd] = useState(false)
  const keyboard = useReanimatedKeyboardAnimation()


  const toggleAside = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (asideOpen) aside.reset()
    else setEditingRow(null)
    setAsideOpen(!asideOpen)
  }

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

  const scrollToNewest = () => listRef.current?.scrollToNewest()

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

  // Over a chat background the user's bubbles can be made see-through.
  const bubbleOpacity = character.background ? 1 - character.backgroundBubbleTransparency : 1
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

  const confirmDelete = () => {
    confirmDeleteChat(async () => {
      discard()
      await deleteChat(db, chatId)
      router.back()
    })
  }

  const promptRename = () => promptRenameChat(title, rename)

  const suggestName = async () => {
    try {
      if (!(await autoName())) showMessage(t('chat.titleNotFoundTitle'), t('chat.titleNotFoundMessage'))
    } catch (err) {
      showMessage(t('chat.titleFailedTitle'), errorMessage(err))
    }
  }

  // The avatar in the header is the menu's trigger, so its photo opens from the menu.
  const avatar = castGallery([character])
  const chatMenu: MenuItem[] = [
    ...(avatar.length ? [{ label: t('chat.menuShowAvatar'), systemImage: 'photo', onSelect: () => openViewer(avatar) }] : []),
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: promptRename },
    { label: t('chat.menuSuggestTitle'), systemImage: 'sparkles', onSelect: suggestName },
    { label: t('chat.menuEditCharacter'), systemImage: 'person.crop.circle', onSelect: () => router.push(`/character/${character.id}`) },
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
      onSelectText={setSelecting}
    />
  ) : null

  const errorCard = error ? <ErrorCard message={error} onRetry={retry} /> : null

  const empty = loaded && rows.length === 0

  return (
    <View style={styles.screen}>
      {character.background ? (
        <ChatBackground
          uri={avatarUri(character.background, 'backgrounds') ?? ''}
          effect={character.backgroundEffect}
          intensity={character.backgroundIntensity}
        />
      ) : null}
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
        left={
          <GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} />
        }
        right={
          <View style={styles.headerActions}>
            {privateEnabled || asideOpen ? (
              <GlassButton
                icon={asideOpen ? 'eye-off' : 'eye-off-outline'}
                onPress={toggleAside}
                accessibilityLabel={t('chat.privateTitle')}
              >
                <SFIcon
                  name={asideOpen ? 'eye.slash.fill' : 'eye.slash'}
                  fallback={asideOpen ? 'eye-off' : 'eye-off-outline'}
                  size={20}
                  color={colors.text}
                  animateChange={asideOpen}
                />
              </GlassButton>
            ) : null}
            <Link href={`/chat/new?character=${character.id}`} asChild>
              <Link.AppleZoom>
                <GlassButton icon="create-outline" />
              </Link.AppleZoom>
            </Link>
          </View>
        }
      >
        {/* When the menu can, it draws the pill's glass itself, so the menu morphs out
            of the pill. */}
        <NativeMenu items={chatMenu} style={styles.whoPress} glassRadius={22}>
          <PillSurface style={[styles.who, liquidGlass && styles.whoPill]}>
            <View style={styles.whoContent}>
              <Avatar name={character.name} file={character.avatar} size={34} viewable={false} />
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
            </View>
          </PillSurface>
        </NativeMenu>
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
          accessory={asidePanel ?? (awayFromEnd ? <JumpButton onPress={() => listRef.current?.jumpToNewest()} /> : null)}
          placeholder={asideOpen ? t('chat.privatePlaceholder') : undefined}
          hushed={asideOpen}
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

      <TextSheet text={selecting} onClose={() => setSelecting(null)} />
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
  whoPress: { alignSelf: 'flex-start', maxWidth: '100%' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whoContent: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  whoPill: { borderRadius: 22, paddingVertical: 4, paddingLeft: 4, paddingRight: 14 },
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
