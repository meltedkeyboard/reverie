import { Icon } from '@/components/visuals/Icon'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AsideToggleButton, ChatSurface, bubbleOpacityOf } from '@/components/chrome/ChatChrome'
import { AsidePanel } from '@/components/chat/AsidePanel'
import { ChatDrawer, useChatDrawer } from '@/components/chrome/ChatDrawer'
import { Avatar } from '@/components/visuals/Avatar'
import { Composer, ComposerFloat, ComposerSwap } from '@/components/chat/Composer'
import { ErrorCard, JumpButton, type ConversationHandle } from '@/components/chat/ConversationList'
import { GlassButton, GlassSurface } from '@/components/chrome/Glass'
import { GlassHeader, useHeaderHeight } from '@/components/chrome/GlassHeader'
import { MessageRow, type RowMessage } from '@/components/chat/MessageRow'
import { NativeMenu, nativeMenuGlass, type MenuItem } from '@/components/overlays/NativeMenu'
import { AvatarStack } from '@/components/cast/AvatarStack'
import { RoomController, RoomIntro, useSceneOf } from '@/components/cast/RoomController'
import { ChatThread } from '@/components/chat/thread/ChatThread'
import {
  createChatOf,
  EMPTY_CONFIG,
  EMPTY_THREAD,
  latestChatOf,
  lookOf,
  noop,
  regenerableOf,
  type ChromeData,
  type Owner,
  type RowConfig,
  type ThreadData,
} from '@/components/chat/thread/screen'
import { createStore, useStore, type Store } from '@/components/chat/thread/store'
import { ShimmerText } from '@/components/visuals/ShimmerText'
import { getCharacter, type Character } from '@/db/characters'
import { createChat, getChat, getLatestChatId, type Chat } from '@/db/chats'
import { getDraft, setDraft } from '@/db/drafts'
import { setContinueHidden, setLastOpened } from '@/db/prefs/continue'
import { newMessage, type Message } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { createRoomChat, getLatestRoomChatId, getRoom, listRoomMembers } from '@/db/rooms'
import { useAside } from '@/hooks/chat/useAside'
import { useChat } from '@/hooks/chat/useChat'
import { useLayoutMode } from '@/hooks/util/useLayoutMode'
import { useChatMenuActions, useMessageActions } from '@/hooks/chat/useChatScreenActions'
import { useChatSwitches } from '@/hooks/util/useStoredFlag'
import { useSuggestion } from '@/hooks/chat/useSuggestion'
import { useTranslation } from '@/i18n'
import { characterScene } from '@/lib/chat/aside'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { prefetchMessages } from '@/lib/chat/messageCache'
import { formatWhen } from '@/lib/core/format'
import * as Haptics from '@/lib/ui/haptics'
import { showToastOnce } from '@/lib/ui/toast'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { FILL, fonts, HEADER_FONT_SCALE, useColors, useStyles, type Colors } from '@/theme'

type Loaded = { chat: Chat; owner: Owner }

export default function ChatScreen() {
  // /chat/new?character=ID (or ?room=ID for a scene) creates the chat on arrival. A
  // button can then be a plain Link with a fixed address, which is what the zoom
  // transition needs. /chat/latest?character=ID is where a character opens: the chat
  // written in last, or a new one when it has none; /chat/latest?room=ID, a room.
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
        if ((id === 'new' || id === 'latest') && roomParam) {
          const room = await getRoom(db, Number(roomParam))
          if (!room) return router.back()
          const latest = id === 'latest' ? await getLatestRoomChatId(db, room.id) : null
          if (latest) chatId = latest
          else {
            created.current ??= createRoomChat(db, room)
            chatId = await created.current
          }
        } else if (id === 'new' || id === 'latest') {
          const owner = await getCharacter(db, Number(characterParam))
          if (!owner) return router.back()
          const latest = id === 'latest' ? await getLatestChatId(db, owner.id) : null
          if (latest) chatId = latest
          else {
            created.current ??= createChat(db, owner)
            chatId = await created.current
          }
        }
        const chat = await getChat(db, chatId)
        if (chat?.roomId) {
          // Re-read on every focus: the room or its cast may have been edited meanwhile.
          const room = await getRoom(db, chat.roomId)
          if (!room) return router.back()
          setLoaded({ chat, owner: { kind: 'room', room, members: await listRoomMembers(db, room.id) } })
          setContinueHidden(db, 'room', false)
          setLastOpened(db, 'room', chat.id)
          if (id === 'new' || id === 'latest') router.setParams({ id: String(chatId), room: undefined })
          return
        }
        const character = chat?.characterId ? await getCharacter(db, chat.characterId) : null
        if (chat && character) {
          // Re-read on every focus as well: the character may have been edited.
          setLoaded({ chat, owner: { kind: 'character', character } })
          // A continue button swiped away on the home screen comes back once a chat opens.
          setContinueHidden(db, 'character', false)
          setLastOpened(db, 'character', chat.id)
          if (id === 'new' || id === 'latest') router.setParams({ id: String(chatId), character: undefined })
        } else router.back()
      })()
    }, [db, id, characterParam, roomParam, router])
  )

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  const focusMessageId = messageParam ? Number(messageParam) : null
  const { owner } = loaded
  return (
    <Chats
      key={owner.kind === 'character' ? `character:${owner.character.id}` : `room:${owner.room.id}`}
      start={loaded.chat}
      owner={owner}
      focusMessageId={focusMessageId}
      // The address catches up with a switch made on the screen once it is over. A message
      // it asked for belongs to the chat it was opened with, so it goes.
      onShown={(chatId) => router.setParams({ id: String(chatId), message: undefined })}
    />
  )
}

// A chat laid out ahead, as it will look once it is on screen: its actions only answer
// once its controller has taken over, which is as it comes on screen.
const aheadOf = (chat: Chat, messages: Message[], look: Look, owner: Owner): ThreadData => ({
  chat,
  rows: messages,
  loaded: true,
  config: { ...EMPTY_CONFIG, ...look, regenerable: regenerableOf(owner, messages) },
  error: null,
  onRetry: noop,
  focusId: null,
})

// How the rows of an owner look whatever their chat: the bubbles over its picture, and in
// a room who said each line.
type Look = Pick<RowConfig, 'bubbleOpacity' | 'sceneOf'>

// How far aside the thread not on screen waits: moved, not faded, as Liquid Glass does not
// render under a parent with opacity.
const PARK = 100_000

type ChatsProps = {
  start: Chat
  owner: Owner
  focusMessageId: number | null
  // A switch made on the screen is over: the address can follow.
  onShown: (chatId: number) => void
}

// The chats of one character, or the scenes of one room, on one screen. The screen keeps
// two threads, one on screen and one behind it, and turns from one to the other on the UI
// thread: a chat picked in the drawer is laid out in the thread behind while the finger is
// still down, so the tap only swaps the two, and nothing is laid out while the chat slides
// back. The header and the composer are made once and only take the chat on screen; its
// logic (`useChat`, `useRoom`) lives in `ChatController` or `RoomController`, which hold no
// views of the thread, so starting one for another chat is cheap.
function Chats({ start, owner: given, focusMessageId, onShown }: ChatsProps) {
  const db = useDatabase()
  const styles = useStyles(createStyles)
  const wide = useLayoutMode() === 'wide'
  // A room's controller changes it as people walk in and out or the floor is switched;
  // coming back to the screen reads it afresh.
  const [owner, setOwner] = useState(given)
  useEffect(() => setOwner(given), [given])
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  const { pattern, wallpaper } = useChatTextSettings()
  const bubbleOpacity = bubbleOpacityOf(lookOf(owner), wallpaper, pattern)
  const sceneOf = useSceneOf(owner.kind === 'room' ? owner.members : null)
  const look = useMemo<Look>(() => ({ bubbleOpacity, sceneOf }), [bubbleOpacity, sceneOf])
  const lookRef = useRef(look)
  lookRef.current = look
  const composerHeight = useSharedValue(0)
  const composerTop = useSharedValue(0)

  const threads = useMemo(() => [createStore<ThreadData>(EMPTY_THREAD), createStore<ThreadData>(EMPTY_THREAD)], [])
  const chrome = useMemo(() => createStore<ChromeData | null>(null), [])
  const away = useMemo(() => createStore(false), [])
  const lists = [useRef<ConversationHandle>(null), useRef<ConversationHandle>(null)]
  // Which thread is on screen: on the UI thread, where a tap swaps them, and for React.
  const front = useSharedValue(0)
  const frozen = [useSharedValue(false), useSharedValue(true)]
  // The chat the thread behind has laid out, once it has: what a tap may swap to.
  const ready = useSharedValue(0)
  const [active, setActive] = useState({ chat: start, thread: 0 })
  const activeRef = useRef(active)
  activeRef.current = active
  const behind = () => 1 - activeRef.current.thread

  // A switch whose chat was not laid out at the tap, or that no tap made (a new chat, a
  // deleted one replaced): it shows as soon as its thread has laid it out.
  const pending = useRef<number | null>(null)
  // The address follows a switch once the drawer is back in place.
  const unannounced = useRef<number | null>(null)
  const staging = useRef<number | null>(null)
  // The chat each thread has laid out. The one behind still holds the chat switched away
  // from, laid out already: going back to it needs no staging, only to be marked ready.
  const laid = useRef([0, 0])

  const commit = useCallback(
    (chat: Chat, thread: number) => {
      away.set(false)
      setActive({ chat, thread })
      // A continue button swiped away on the home screen comes back once a chat opens.
      setContinueHidden(db, ownerRef.current.kind, false)
      setLastOpened(db, ownerRef.current.kind, chat.id)
      unannounced.current = chat.id
    },
    [db, away]
  )
  const announce = useCallback(() => {
    if (unannounced.current === null) return
    onShown(unannounced.current)
    unannounced.current = null
  }, [onShown])

  // Swaps the threads from JavaScript, for a switch the tap could not make.
  const swapNow = (thread: number) => {
    front.value = thread
    frozen[thread].value = false
    frozen[1 - thread].value = true
  }

  const stage = useCallback(
    async (chat: Chat) => {
      if (chat.id === activeRef.current.chat.id) return
      const thread = 1 - activeRef.current.thread
      if (threads[thread].get().chat?.id === chat.id) {
        if (laid.current[thread] === chat.id) ready.value = chat.id
        return
      }
      ready.value = 0
      laid.current[thread] = 0
      staging.current = chat.id
      const messages = await prefetchMessages(db, chat.id).catch(() => [])
      if (staging.current !== chat.id) return
      threads[thread].set(aheadOf(chat, messages, lookRef.current, ownerRef.current))
    },
    [db, threads, ready]
  )

  // A thread has laid its chat out.
  const laidOut = useCallback(
    (thread: number, chatId: number) => {
      if (threads[thread].get().chat?.id === chatId) laid.current[thread] = chatId
      if (thread !== behind()) return
      if (staging.current === chatId) staging.current = null
      ready.value = chatId
      if (pending.current !== chatId) return
      pending.current = null
      const chat = threads[thread].get().chat
      if (!chat) return
      swapNow(thread)
      commit(chat, thread)
      if (!drawerMoving.current) announce()
    },
    // swapNow only writes shared values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threads, ready, commit, announce]
  )

  // Shows a chat that no tap swapped to: laid out behind first, then swapped.
  const show = useCallback(
    (chat: Chat) => {
      pending.current = chat.id
      const thread = behind()
      if (threads[thread].get().chat?.id === chat.id && laid.current[thread] === chat.id) laidOut(thread, chat.id)
      else stage(chat)
    },
    // behind reads a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threads, ready, stage, laidOut]
  )

  // On the UI thread, as a tap on a row of the drawer lifts.
  const flipTo = useCallback(
    (chatId: number) => {
      'worklet'
      if (ready.value !== chatId) return false
      const thread = 1 - front.value
      front.value = thread
      frozen[thread].value = false
      frozen[1 - thread].value = true
      return true
    },
    // The shared values are the same throughout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const drawerMoving = useRef(false)
  const onSelect = useCallback(
    (chat: Chat, shown: boolean) => {
      drawerMoving.current = true
      if (shown) commit(chat, 1 - activeRef.current.thread)
      else show(chat)
    },
    [commit, show]
  )
  const onClosed = useCallback(() => {
    drawerMoving.current = false
    announce()
  }, [announce])

  const startNew = useCallback(async () => {
    const chat = await getChat(db, await createChatOf(db, ownerRef.current))
    if (chat) show(chat)
  }, [db, show])
  // A deleted chat gives way to the one written in last, or to a new one.
  const replaceDeleted = useCallback(async () => {
    const next = await latestChatOf(db, ownerRef.current)
    const chat = next ? await getChat(db, next) : null
    if (chat) show(chat)
    else startNew()
  }, [db, show, startNew])

  // The address may name another chat of the owner (the wide layout's sidebar).
  const startId = useRef(start.id)
  useEffect(() => {
    if (startId.current === start.id) return
    startId.current = start.id
    if (start.id !== activeRef.current.chat.id) show(start)
  }, [start, show])

  // Once the chat on screen is in, the thread behind lays it out too, unseen and at
  // leisure: its cells are then there to be reused by the first chat staged in it.
  const warmed = useRef(false)
  useEffect(() => {
    if (warmed.current) return
    const timer = setTimeout(() => {
      const shown = threads[activeRef.current.thread].get()
      const other = threads[1 - activeRef.current.thread]
      if (!shown.loaded || other.get().chat) return
      warmed.current = true
      other.set({ ...shown, config: { ...EMPTY_CONFIG, ...lookRef.current, regenerable: shown.config.regenerable } })
    }, WARM_DELAY)
    return () => clearTimeout(timer)
  })

  const scrollToNewest = useCallback(() => {
    away.set(false)
    lists[activeRef.current.thread].current?.scrollToNewest()
  }, [lists, away])

  return (
    <ChatDrawer
      owner={owner}
      chatId={active.chat.id}
      enabled={!wide}
      onStage={stage}
      flipTo={flipTo}
      onSelect={onSelect}
      onNewChat={startNew}
      onCurrentDeleted={replaceDeleted}
      onClosed={onClosed}
    >
      <View style={styles.screen}>
        <ChatSurface owner={lookOf(owner)} />
        {[0, 1].map((thread) => (
          <ThreadSurface
            key={thread}
            index={thread}
            store={threads[thread]}
            front={front}
            onScreen={active.thread === thread}
            frozen={frozen[thread]}
            listRef={lists[thread]}
            owner={owner}
            composerHeight={composerHeight}
            onLaidOut={laidOut}
            onAwayChange={(value) => {
              if (activeRef.current.thread === thread) away.set(value)
            }}
          />
        ))}
        <ChatChrome
          store={chrome}
          away={away}
          owner={owner}
          composerHeight={composerHeight}
          composerTop={composerTop}
          onJump={() => lists[activeRef.current.thread].current?.jumpToNewest()}
          onNewChat={startNew}
        />
      </View>
      {owner.kind === 'character' ? (
        <ChatController
          key={active.chat.id}
          chat={active.chat}
          character={owner.character}
          thread={threads[active.thread]}
          chrome={chrome}
          focusMessageId={active.chat.id === start.id ? focusMessageId : null}
          composerHeight={composerHeight}
          scrollToNewest={scrollToNewest}
          onDeleted={replaceDeleted}
        />
      ) : (
        <RoomController
          key={active.chat.id}
          chat={active.chat}
          room={owner.room}
          members={owner.members}
          onRoomChange={(room) => setOwner((o) => (o.kind === 'room' ? { ...o, room } : o))}
          onMembersChange={(members) => setOwner((o) => (o.kind === 'room' ? { ...o, members } : o))}
          thread={threads[active.thread]}
          chrome={chrome}
          focusMessageId={active.chat.id === start.id ? focusMessageId : null}
          composerHeight={composerHeight}
          scrollToNewest={scrollToNewest}
          onDeleted={replaceDeleted}
        />
      )}
    </ChatDrawer>
  )
}

// How long after the chat comes up the thread behind lays it out as well.
const WARM_DELAY = 1500

type ThreadSurfaceProps = {
  index: number
  store: Store<ThreadData>
  front: SharedValue<number>
  onScreen: boolean
  frozen: SharedValue<boolean>
  listRef: RefObject<ConversationHandle | null>
  owner: Owner
  composerHeight: SharedValue<number>
  onLaidOut: (thread: number, chatId: number) => void
  onAwayChange: (away: boolean) => void
}

// One of the two threads: the messages of a chat over the screen's background, moved
// aside while the other one is on screen.
function ThreadSurface({ index, store, front, onScreen, frozen, listRef, owner, composerHeight, onLaidOut, onAwayChange }: ThreadSurfaceProps) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const keyboard = useReanimatedKeyboardAnimation()
  const data = useStore(store)
  const { chat, rows, loaded, config } = data
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: front.value === index ? 0 : PARK }] }))

  const chatId = chat?.id ?? 0
  // Said once the thread has laid the chat out and settled at its newest message.
  const landed = useCallback(
    (key: number) => {
      if (key && key === store.get().chat?.id && store.get().loaded) onLaidOut(index, key)
    },
    [store, index, onLaidOut]
  )

  const renderRow = useCallback(
    (row: RowMessage) => (
      <MessageRow
        message={row}
        canRegenerate={config.regenerable.has(row.id)}
        locked={config.locked}
        onAction={config.onAction}
        onSelectVariant={config.onSelectVariant}
        bubbleOpacity={config.bubbleOpacity}
        scene={config.sceneOf?.(row)}
        hydrate={onScreen ? 'go' : 'wait'}
      />
    ),
    [config, onScreen]
  )

  // The empty-chat intro stays centered in the space left between the header and the
  // composer, which moves up with the keyboard.
  const emptyStyle = useAnimatedStyle(() => ({
    paddingTop: headerHeight,
    paddingBottom: composerHeight.value + Math.max(0, Math.abs(keyboard.height.value) - insets.bottom),
  }))

  const empty = loaded && rows.length === 0
  // Kept while the chat is the same: a new intro is a new first item of the list.
  const intro = useMemo(
    () => (chat && loaded && !empty ? <Intro owner={owner} chat={chat} /> : null),
    [chat, loaded, empty, owner]
  )
  return (
    <Animated.View
      style={[FILL, style]}
      pointerEvents={onScreen ? 'box-none' : 'none'}
      accessibilityElementsHidden={!onScreen}
      importantForAccessibility={onScreen ? 'auto' : 'no-hide-descendants'}
    >
      <ChatThread
        ref={listRef}
        chatKey={chatId}
        rows={rows}
        renderRow={renderRow}
        extraData={renderRow}
        composerHeight={composerHeight}
        top={intro}
        bottom={data.error ? <ErrorCard message={data.error} onRetry={data.onRetry} /> : null}
        onAwayChange={onAwayChange}
        focusId={data.focusId}
        frozen={frozen}
        onLanded={landed}
      />
      {chat && empty ? (
        owner.kind === 'character' ? (
          <Animated.View style={[styles.empty, emptyStyle]} pointerEvents="none">
            <Intro owner={owner} chat={chat} hint={t('chat.emptyHint')} />
          </Animated.View>
        ) : (
          // A room's scenario can run long, so its intro scrolls.
          <Animated.View style={[styles.empty, emptyStyle]} pointerEvents="box-none">
            <ScrollView style={styles.emptyScroll} contentContainerStyle={styles.emptyContent} showsVerticalScrollIndicator={false}>
              <Intro owner={owner} chat={chat} hint={owner.members.length ? t('room.emptyHint') : t('room.noMembersHint')} />
            </ScrollView>
          </Animated.View>
        )
      ) : null}
    </Animated.View>
  )
}

type ChatChromeProps = {
  store: Store<ChromeData | null>
  away: Store<boolean>
  owner: Owner
  composerHeight: SharedValue<number>
  composerTop: SharedValue<number>
  onJump: () => void
  onNewChat: () => void
}

// The header and the composer of the screen, made once: another chat only changes what
// they show, so their glass is never made anew.
function ChatChrome({ store, away, owner, composerHeight, composerTop, onJump, onNewChat }: ChatChromeProps) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  // The way out of a chat is the drawer's list; in a wide window, the sidebar.
  const drawer = useChatDrawer()
  const { privateEnabled } = useChatSwitches()
  const data = useStore(store)
  const awayFromEnd = useStore(away)
  const asideOpen = data?.asideOpen ?? false
  const { pattern, wallpaper } = useChatTextSettings()
  const hasCustomBackground = Boolean(lookOf(owner).background) || (pattern === 'custom' && Boolean(wallpaper?.file))

  return (
    <>
      <GlassHeader
        floating
        fade={!hasCustomBackground}
        left={
          drawer ? (
            <GlassButton icon="menu" iconSize={22} onPress={drawer.open} accessibilityLabel={t('chatDrawer.open')} />
          ) : undefined
        }
        right={
          <View style={styles.headerActions}>
            <AsideToggleButton open={asideOpen} enabled={privateEnabled} onPress={data?.toggleAside ?? noop} />
            {data?.fresh ? (
              <GlassButton icon="create-outline" onPress={() => showToastOnce({ title: t('chat.alreadyNew'), tone: 'info' })} />
            ) : (
              <GlassButton icon="create-outline" onPress={onNewChat} />
            )}
          </View>
        }
      >
        {owner.kind === 'character' ? (
          <View style={styles.headerWho}>
            {/* The photo is a button of its own, as in Telegram: it opens full screen, and
                the pill beside it keeps the menu. */}
            <GlassSurface interactive style={styles.photo}>
              <Avatar name={owner.character.name} file={owner.character.avatar} size={38} />
            </GlassSurface>
            {/* When the menu can, it draws the pill's glass itself, so the menu morphs out
                of the pill. */}
            <NativeMenu items={data?.chatMenu ?? []} style={styles.whoPress} glassRadius={22}>
              <PillSurface style={[styles.who, liquidGlass && styles.whoPill]}>
                <WhoText name={owner.character.name} data={data} />
              </PillSurface>
            </NativeMenu>
          </View>
        ) : (
          // The cast is the menu's trigger, so their photos open from the menu.
          <NativeMenu items={data?.chatMenu ?? []} style={styles.roomPress} glassRadius={22}>
            <PillSurface style={[styles.roomWho, liquidGlass && styles.roomPill]}>
              <AvatarStack cast={owner.members.map((m) => ({ name: m.character.name, avatar: m.character.avatar }))} size={28} viewable={false} />
              <WhoText name={owner.room.name} data={data} />
            </PillSurface>
          </NativeMenu>
        )}
      </GlassHeader>

      {data ? (
        // With the private thread open the field talks to the model aside, and the thread
        // takes the accessory slot so it rides the keyboard with the field.
        <ComposerSwap id={asideOpen ? 'aside' : 'scene'}>
          <Composer {...data.composer} height={composerHeight} top={composerTop} resetKey={data.chatId} fade={!hasCustomBackground} />
        </ComposerSwap>
      ) : null}
      {/* Outside the swap, so it neither sinks with the field nor goes missing in Private. */}
      <ComposerFloat top={composerTop}>
        <JumpButton visible={awayFromEnd} onPress={onJump} />
      </ComposerFloat>
    </>
  )
}

type ChatControllerProps = {
  chat: Chat
  character: Character
  // The thread the chat is on, and the screen's header and composer.
  thread: Store<ThreadData>
  chrome: Store<ChromeData | null>
  focusMessageId: number | null
  composerHeight: SharedValue<number>
  scrollToNewest: () => void
  onDeleted: () => void
}

// The logic of the chat on screen, without a view of its own: it reads and writes the
// chat and hands what it has to its thread and to the header and composer. Made anew for
// each chat (keyed by it), which costs no layout.
function ChatController({ chat, character, thread, chrome, focusMessageId, composerHeight, scrollToNewest, onDeleted }: ChatControllerProps) {
  const chatId = chat.id
  const db = useDatabase()
  const router = useRouter()
  const { t } = useTranslation()
  const { suggestEnabled } = useChatSwitches()
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
    thinking,
    toggleThinking,
    persona,
    personaId,
    selectPersona,
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
  // The eye in the header opens a private thread with the model about this chat.
  const [asideOpen, setAsideOpen] = useState(false)
  // What was typed to the character waits here while the field asks the model aside, and
  // stays as the chat's draft until it is sent.
  const sceneDraft = useRef(getDraft(chatId))
  const toggleAside = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (asideOpen) aside.reset()
    else setEditingRow(null)
    setAsideOpen(!asideOpen)
  }

  const idle = phase === 'idle'
  const [suggestion, clearSuggestion, dismissSuggestion] = useSuggestion(scene, messages, suggestEnabled && idle && !asideOpen && !editingRow)
  // Changing the conversation while a reply streams or a message is edited would pull
  // the context out from under it, so only reading actions stay available then.
  const locked = !idle || editingRow !== null

  const regenerable = useMemo(() => regenerableOf({ kind: 'character', character }, messages), [character, messages])

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
    return list
  }, [messages, replacingId, draft, reasoning, reasoningMs, chatId])

  const editing = useMemo(
    () => (editingRow ? { id: editingRow.id, text: editingRow.content } : null),
    [editingRow]
  )

  const onAction = useMessageActions({ regenerate, removeMessage, edit: setEditingRow })
  const { confirmDelete, promptRename, suggestName } = useChatMenuActions({ chatId, title, rename, autoName, discard, onDeleted })

  // Over a chat background the user's bubbles can be made see-through.
  const { pattern, wallpaper } = useChatTextSettings()
  const bubbleOpacity = bubbleOpacityOf(character, wallpaper, pattern)
  const config = useMemo<RowConfig>(
    () => ({ regenerable, locked, onAction, onSelectVariant: selectVariant, bubbleOpacity }),
    [regenerable, locked, onAction, selectVariant, bubbleOpacity]
  )

  const initialCount = character.greeting.trim() ? 1 : 0
  // Nothing written yet: a new chat from here would be the same as this one.
  const fresh = loaded && !rows.some((r) => r.role === 'user') && rows.length <= initialCount

  // Until its messages are in, the thread keeps what it shows: the chat as it was laid out
  // ahead, the same messages.
  useLayoutEffect(() => {
    if (!loaded) return
    thread.set({ chat, rows, loaded, config, error, onRetry: retry, focusId: focusMessageId })
  })

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

  useLayoutEffect(() => {
    chrome.set({
      chatId,
      title,
      naming,
      fresh,
      chatMenu,
      asideOpen,
      toggleAside,
      composer: {
        initialText: asideOpen ? undefined : sceneDraft.current,
        onTextChange: asideOpen
          ? undefined
          : (text) => {
              sceneDraft.current = text
              setDraft(db, chatId, text)
            },
        autoFocus: asideOpen,
        generating: asideOpen ? aside.phase !== 'idle' : !idle,
        editing: asideOpen ? null : editing,
        accessory: asidePanel,
        placeholder: asideOpen ? t('chat.privatePlaceholder') : undefined,
        hushed: asideOpen,
        suggestion,
        onSuggestionTaken: clearSuggestion,
        onSuggestionDismissed: dismissSuggestion,
        thinking: asideOpen ? undefined : thinking,
        onToggleThinking: asideOpen ? undefined : toggleThinking,
        persona: asideOpen ? undefined : persona,
        personaId: asideOpen ? undefined : personaId,
        onSelectPersona: asideOpen ? undefined : selectPersona,
        onSend: (text, image) => {
          if (asideOpen) return void aside.ask(text, image)
          send(text, image)
          scrollToNewest()
        },
        onStop: asideOpen ? aside.stop : stop,
        onContinue:
          messages.length && !asideOpen
            ? () => {
                proceed()
                scrollToNewest()
              }
            : undefined,
        onSubmitEdit: async (text) => {
          if (editingRow) await editMessage(editingRow.id, text)
          setEditingRow(null)
        },
        onCancelEdit: () => setEditingRow(null),
      },
    })
  })

  return null
}

// The name in the header's pill, with the chat's title under it, shimmering while it is named.
function WhoText({ name, data }: { name: string; data: ChromeData | null }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  return (
    <View style={styles.whoText}>
      <View style={styles.nameRow}>
        <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Icon name="chevron-down" size={14} color={colors.textMuted} />
      </View>
      {data?.naming ? (
        <ShimmerText maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.subtitle} text={data.title ?? t('chat.namingInProgress')} />
      ) : data?.title ? (
        <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.subtitle} numberOfLines={1}>
          {data.title}
        </Text>
      ) : null}
    </View>
  )
}

// Above the first message, and in the middle of an empty chat: the character's photo and
// name, or the room's cast, name and scenario.
function Intro({ owner, chat, hint }: { owner: Owner; chat: Chat; hint?: string }) {
  const styles = useStyles(createStyles)
  const { locale } = useTranslation()
  if (owner.kind === 'room') return <RoomIntro room={owner.room} members={owner.members} hint={hint} />
  const { character } = owner
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
  roomPress: { alignSelf: 'flex-start', maxWidth: '100%' },
  roomWho: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roomPill: { borderRadius: 22, paddingVertical: 4, paddingLeft: 6, paddingRight: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flexShrink: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 18, fontWeight: '600' },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 1 },
  intro: { alignItems: 'center', paddingTop: 24, paddingBottom: 20, paddingHorizontal: 32 },
  introName: { color: colors.text, fontFamily: fonts.prose, fontSize: 22, marginTop: 12 },
  introMeta: { color: colors.textFaint, fontSize: 14, marginTop: 4, textAlign: 'center' },
  empty: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  emptyScroll: { alignSelf: 'stretch' },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
})
