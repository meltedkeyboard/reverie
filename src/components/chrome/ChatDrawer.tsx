import { Stack, useRouter } from 'expo-router'
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, Keyboard, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, { interpolate, measure, useAnimatedRef, useAnimatedStyle, useSharedValue, withSpring, type AnimatedRef } from 'react-native-reanimated'
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { AvatarStack } from '@/components/cast/AvatarStack'
import { holdHydration } from '@/components/chat/thread/hydration'
import { listChatsOf, ownerKey, type Owner } from '@/components/chat/thread/screen'
import { deleteChat, listChats, pruneUntouchedChats, setChatOrder, type Chat, type ChatPreview } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { importChatToRoom, listRooms, type RoomPreview } from '@/db/rooms'
import { useChatListActions } from '@/hooks/chat/useChatListActions'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { onChatsChanged } from '@/lib/chat/chatEvents'
import { prefetchMessages } from '@/lib/chat/messageCache'
import { confirmDeleteChat } from '@/lib/chat/chatDialogs'
import { plainPreview } from '@/lib/chat/roleplay'
import { countLabel, formatWhen } from '@/lib/core/format'
import { showMessage, showSheet } from '@/lib/ui/dialogs'
import * as Haptics from '@/lib/ui/haptics'
import { swiftUI } from '@/lib/ui/nativeUI'
import { FILL, fonts, HEADER_FONT_SCALE, useColors, useStyles, useTheme, type Colors } from '@/theme'

import { GlassButton, GlassSurface, useGlassStyles } from './Glass'
import { IconButton } from '../controls/IconButton'
import { NativeMenu, type MenuItem } from '../overlays/NativeMenu'
import { Avatar } from '../visuals/Avatar'
import { Icon } from '../visuals/Icon'
import { displayCornerRadius } from '../../../modules/reverie-splash'

type Props = {
  // A character's chats, or a room's scenes.
  owner: Owner
  chatId: number
  // Off in the wide layout, where the app's own sidebar lists the chats.
  enabled: boolean
  // A finger came down on another chat of the list: the screen lays it out unseen behind
  // the one on screen, in the time the tap takes.
  onStage: (chat: Chat) => void
  // A worklet, run on the UI thread as a tap on a row lifts: shows that chat at once if it
  // is laid out by then, and says whether it did.
  flipTo: (chatId: number) => boolean
  // Then, in JavaScript: the chat tapped, and whether it is on screen already.
  onSelect: (chat: Chat, shown: boolean) => void
  onNewChat: () => void
  // The chat on screen was deleted from the list: something must take its place.
  onCurrentDeleted: () => void
  // The chat is back in place, the motion over: the screen does what it put off till now.
  onClosed: () => void
  children: React.ReactNode
}

type DrawerHandle = {
  open: () => void
  // A view inside the chat whose touches never open it: the composer's row, whose swipe of
  // a suggestion and whose field keep the finger. Looked up where the touch lands rather
  // than made to win by `blocksExternalGesture`: waiting on the composer's gestures, the
  // drag stayed begun whenever one of their touches was lost (a keyboard going down, the
  // row laid out anew), and neither the drag nor the header's button answered for seconds.
  guard: AnimatedRef<Animated.View>
  // Off while a sheet is up over the chat. A touch that opens one (the composer's plus)
  // begins this drag too, and with the sheet taking the screen its end never arrives: the
  // drag stays begun and the chat takes no touch for seconds after the sheet is gone.
  // Turning it off resets it.
  suspend: (suspended: boolean) => void
}

const DrawerContext = createContext<DrawerHandle | null>(null)

// The button in the chat's header that slides the chat aside; null where there is no drawer.
export const useChatDrawer = () => useContext(DrawerContext)

// How many chats of the list have their messages read ahead when it opens.
const READ_AHEAD = 5
// How many chats of the cast a room offers to start a scene from.
const IMPORT_CHOICES = 12

// How much of the width the chat moves aside: the strip left of it is tapped or dragged back.
const SHIFT = 0.84
// A flick faster than this (pt/s) settles the way it goes, wherever the finger let go.
const FLICK = 500
// Critically damped, as UIKit moves its own sheets; short, so the drawer keeps up with the hand.
const SPRING = { duration: 320, dampingRatio: 1 }
// The chat rounds off like the screen itself, so it looks like the whole screen moved.
const CORNER = displayCornerRadius() || 24
const ROW_RADIUS = 12
// How dark the chat gets once fully aside; the dark scheme needs more to show at all.
const VEIL = { light: 0.12, dark: 0.35 }
// Who holds the message rows' upgrades off while the drawer moves (see thread/hydration).
const HOLD = 'drawer'

// A firm tap the moment the drawer is decided to open or close (the button, the finger let
// go), as iOS does: waiting for the spring to arrive made it come late after the motion.
const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

// The chats of one character, or the scenes of one room, under the chat, as in the Claude
// app: the chat is a card over the list and slides to the right to uncover it, by the button
// in its header or a drag to the right from anywhere on it. The list only switches between
// the owner's chats; the back button is the one way out to the rest of the app.
//
// It only moves the chat and says what was picked: the screen keeps two chats laid out, one
// behind the other, and turns to the one tapped on the UI thread (`flipTo`), so nothing is
// laid out while the chat slides back.
export function ChatDrawer({ owner, chatId, enabled, onStage, flipTo, onSelect, onNewChat, onCurrentDeleted, onClosed, children }: Props) {
  const db = useDatabase()
  const router = useRouter()
  const colors = useColors()
  // Read through a ref: a room's cast changes as people come and go, its list does not.
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  const key = ownerKey(owner)
  const insets = useSafeAreaInsets()
  const styles = useStyles(createStyles)
  const glass = useGlassStyles()
  const { t, locale } = useTranslation()
  const { width } = useWindowDimensions()
  const shift = Math.round(width * SHIFT)
  const progress = useSharedValue(0)
  const start = useSharedValue(0)
  // The state the drawer is going to, so a drag that falls back where it was gives no tap.
  const target = useSharedValue(0)
  const [open, setOpen] = useState(false)
  const [suspended, setSuspended] = useState(false)
  const [chats, setChats] = useState<ChatPreview[]>([])
  const [rooms, setRooms] = useState<RoomPreview[]>([])

  const reload = useCallback(async () => {
    setChats(await listChatsOf(db, ownerRef.current))
    // The list belongs to the owner, which only the key tells apart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key])

  useEffect(() => {
    if (!enabled) return
    reload()
    return onChatsChanged(reload)
  }, [enabled, reload])

  const { duplicate, rename } = useChatListActions(reload)
  // A long press picks a row up to drag it to another place, as on the list of chats before.
  const listReorder = useReorder(chats, setChats, (ids) => setChatOrder(db, ids))
  // While a row is in the air, a move to the left is its own, not a close of the drawer.
  const reordering = useSharedValue(false)
  // Taken out on their own: a worklet that reached them through listReorder would have to
  // copy its pan gesture to the UI thread, which it cannot.
  const { onDragStart: pickUp, onDragEnd: drop } = listReorder
  const reorder = {
    ...listReorder,
    onDragStart: () => {
      'worklet'
      reordering.value = true
      pickUp()
    },
    onDragEnd: () => {
      'worklet'
      reordering.value = false
      drop()
    },
  }

  // Chats opened and left untouched are dropped once the list shows, as on any list; the
  // one on screen stays.
  // The chats near the top are read ahead as the list opens; any other is read as the
  // finger lands on it.
  const prepare = () => {
    Keyboard.dismiss()
    pruneUntouchedChats(db, chatId)
      .then(() => listChatsOf(db, ownerRef.current))
      .then((list) => {
        setChats(list)
        for (const chat of list.filter((c) => c.id !== chatId).slice(0, READ_AHEAD)) prefetchMessages(db, chat.id).catch(() => {})
      })
    if (ownerRef.current.kind === 'character') listRooms(db).then(setRooms)
  }

  // The gesture is made once per state, so what it schedules is read through a ref.
  const prepareRef = useRef(prepare)
  prepareRef.current = prepare
  const runPrepare = useCallback(() => prepareRef.current(), [])

  // The motion is over: the rows may take on their rich views again, and what the screen
  // put off happens now.
  const closedRef = useRef(onClosed)
  closedRef.current = onClosed
  const settled = useCallback((to: number) => {
    holdHydration(HOLD, false)
    if (to === 0) {
      setOpen(false)
      closedRef.current()
    }
  }, [])
  const finish = (to: number) => {
    'worklet'
    scheduleOnRN(settled, to)
  }
  // Every motion of the drawer goes through here, from a gesture or from JavaScript.
  const moveTo = (to: number, velocity = 0) => {
    'worklet'
    if (to !== target.value) scheduleOnRN(tap)
    target.value = to
    scheduleOnRN(holdHydration, HOLD, true)
    if (to === 1) scheduleOnRN(setOpen, true)
    progress.value = withSpring(to, { ...SPRING, velocity }, (done) => {
      if (done) finish(to)
    })
  }

  const show = useCallback(() => {
    runPrepare()
    moveTo(1)
    // moveTo only reads shared values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runPrepare])
  const hide = useCallback(() => {
    moveTo(0)
    // moveTo only reads shared values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      hide()
      return true
    })
    return () => sub.remove()
  }, [open, hide])

  // Leaving the wide layout with the list open would leave the chat aside with no way back.
  useEffect(() => {
    if (!enabled) hide()
  }, [enabled, hide])

  const begin = () => {
    'worklet'
    start.value = progress.value
    scheduleOnRN(holdHydration, HOLD, true)
  }
  const follow = (dx: number) => {
    'worklet'
    progress.value = Math.min(1, Math.max(0, start.value + dx / shift))
  }
  const release = (vx: number) => {
    'worklet'
    moveTo(vx > FLICK ? 1 : vx < -FLICK ? 0 : progress.value > 0.5 ? 1 : 0, vx / shift)
  }

  // Only a drag to the right that is clearly sideways: one to the left or up and down is
  // left to the chat (its scroll, the swipe that dismisses a suggestion). The text of a
  // reply is selected after a long press without moving, before this can start.
  const guard = useAnimatedRef<Animated.View>()
  const openPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled && !suspended)
        .activeOffsetX(14)
        .failOffsetX(-10)
        .failOffsetY([-12, 12])
        .onTouchesDown((e, manager) => {
          const touch = e.allTouches[0]
          const box = measure(guard)
          if (!touch || !box) return
          const { absoluteX: x, absoluteY: y } = touch
          if (x >= box.pageX && x <= box.pageX + box.width && y >= box.pageY && y <= box.pageY + box.height) manager.fail()
        })
        .onStart(() => {
          begin()
          scheduleOnRN(runPrepare)
        })
        .onUpdate((e) => follow(e.translationX))
        .onEnd((e) => release(e.velocityX)),
    // begin, follow and release change only with shift.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, suspended, shift, runPrepare, guard]
  )
  const handle = useMemo(
    () => (enabled ? { open: show, guard, suspend: setSuspended } : null),
    [enabled, guard, show]
  )

  // The strip of the chat still showing: a tap brings it back, a drag carries it.
  const stripPan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(begin)
    .onUpdate((e) => follow(e.translationX))
    .onEnd((e) => release(e.velocityX))
  const stripTap = Gesture.Tap().onEnd(() => moveTo(0))
  const strip = Gesture.Exclusive(stripPan, stripTap)
  // Up as soon as the chat leaves its place and gone only once it is back, all on the UI
  // thread: gated by React's state, a swipe right after another came before the gestures
  // had caught up with it, and was lost.
  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value > 0 ? 0 : 100_000 }] }))

  // A swipe to the left over the list closes it too; up and down is the list's scroll.
  // The list's own pan takes any move first (it has no direction of its own, being what
  // carries a lifted row), so the two run together and a lifted row turns this one off.
  const listPan = Gesture.Pan()
    .activeOffsetX(-12)
    .failOffsetX(12)
    .failOffsetY([-12, 12])
    .simultaneousWithExternalGesture(listReorder.panGesture)
    .onTouchesMove((_, manager) => {
      if (reordering.value) manager.fail()
    })
    .onStart(begin)
    .onUpdate((e) => {
      if (!reordering.value) follow(e.translationX)
    })
    .onEnd((e) => {
      if (reordering.value) moveTo(target.value)
      else release(e.velocityX)
    })

  const chatStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * shift }],
    shadowOpacity: interpolate(progress.value, [0, 1], [0, 0.18]),
  }))
  // Square while it covers the screen, so nothing at its corners is ever clipped.
  const clipStyle = useAnimatedStyle(() => ({ borderRadius: progress.value > 0 ? CORNER : 0 }))
  const { scheme } = useTheme()
  const veil = VEIL[scheme]
  const veilStyle = useAnimatedStyle(() => ({ opacity: progress.value * veil }))
  const outlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.1], [0, 1], 'clamp'),
    display: progress.value > 0 ? 'flex' : 'none',
  }))

  // What a tap on a row starts in JavaScript, after the UI thread has done its part.
  const pick = (id: number, shown: boolean) => {
    const chat = chats.find((c) => c.id === id)
    if (chat && id !== chatId) onSelect(chat, shown)
  }
  const pickRef = useRef(pick)
  pickRef.current = pick
  const runPick = useCallback((id: number, shown: boolean) => pickRef.current(id, shown), [])

  // A tap on a row closes the drawer as the finger lifts, on the UI thread, as in the ChatGPT
  // app, and in that same frame the chat tapped takes the place of the one on screen: it
  // was laid out behind it while the finger was down. One not laid out yet (a very quick
  // tap) shows as soon as it is.
  const shownOnUI = useSharedValue(chatId)
  useEffect(() => {
    shownOnUI.value = chatId
  }, [chatId, shownOnUI])
  const rowTap = useCallback(
    (id: number) => {
      'worklet'
      const shown = id === shownOnUI.value || flipTo(id)
      moveTo(0)
      scheduleOnRN(runPick, id, shown)
    },
    // moveTo only reads shared values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shownOnUI, flipTo, runPick]
  )

  const startNew = () => {
    hide()
    onNewChat()
  }

  const remove = (chat: ChatPreview) => {
    confirmDeleteChat(async () => {
      await deleteChat(db, chat.id)
      if (chat.id === chatId) onCurrentDeleted()
      reload()
    })
  }

  // The chat is copied into the room, as from the old list of chats; see importChatToRoom.
  const moveToRoom = async (chat: ChatPreview, roomId: number | null = null) => {
    const { roomId: target, chatId: sceneId } = await importChatToRoom(db, chat.id, roomId)
    hide()
    router.push(`/chat/${sceneId}`)
    if (roomId === null) router.push(`/room/${target}`)
  }

  // Any one-on-one chat of someone in the room can seed a scene here; the original stays put.
  const importScene = async () => {
    if (owner.kind !== 'room') return
    const found = (
      await Promise.all(
        owner.members.map(async (m) => (await listChats(db, m.characterId)).map((chat) => ({ chat, name: m.character.name })))
      )
    )
      .flat()
      .filter(({ chat }) => chat.messageCount > 1)
      .sort((a, b) => b.chat.lastActivity - a.chat.lastActivity)
      .slice(0, IMPORT_CHOICES)
    if (!found.length) return showMessage(t('rooms.importNothingTitle'), t('rooms.importNothingMessage'))
    showSheet(
      t('rooms.importTitle'),
      found.map(({ chat, name }) => ({
        label: `${name}: ${chat.title ?? formatWhen(chat.lastActivity, locale)}`,
        onSelect: async () => {
          const { chatId: sceneId } = await importChatToRoom(db, chat.id, owner.room.id)
          await reload()
          const scene = (await listChatsOf(db, owner)).find((c) => c.id === sceneId)
          if (scene) {
            hide()
            onSelect(scene, false)
          }
        },
      }))
    )
  }

  const roomMenu: MenuItem[] =
    owner.kind === 'room'
      ? [
          { label: t('rooms.importTitle'), systemImage: 'square.and.arrow.down', onSelect: importScene },
          { label: t('room.menuEditRoom'), systemImage: 'slider.horizontal.3', onSelect: () => router.push(`/room/${owner.room.id}`) },
        ]
      : []

  const moveItem = (chat: ChatPreview): MenuItem =>
    rooms.length
      ? {
          label: t('chat.menuMoveToRoom'),
          systemImage: 'person.3',
          children: [
            { label: t('chat.menuNewRoom'), systemImage: 'plus', onSelect: () => moveToRoom(chat) },
            ...rooms.map((room) => ({ label: room.name, onSelect: () => moveToRoom(chat, room.id) })),
          ],
        }
      : { label: t('chat.menuMoveToRoom'), systemImage: 'person.3', onSelect: () => moveToRoom(chat) }

  const menuItems = (chat: ChatPreview): MenuItem[] => [
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: () => rename(chat) },
    { label: t('chat.menuDuplicate'), systemImage: 'plus.square.on.square', onSelect: () => duplicate(chat) },
    // A scene is in its room already.
    ...(owner.kind === 'room' ? [] : [moveItem(chat)]),
    { label: t('chat.menuDeleteChat'), systemImage: 'trash', destructive: true, onSelect: () => remove(chat) },
  ]

  const cast = useMemo(
    () => (owner.kind === 'room' ? owner.members.map((m) => ({ name: m.character.name, avatar: m.character.avatar })) : []),
    [owner]
  )

  // Made once, so the rows are memoized and a switch renders only the two whose state changed.
  const menuRef = useRef(menuItems)
  menuRef.current = menuItems
  const menuFor = useCallback((chat: ChatPreview) => menuRef.current(chat), [])
  const stageRef = useRef(onStage)
  stageRef.current = onStage
  const stage = useCallback((chat: ChatPreview) => stageRef.current(chat), [])

  return (
    <DrawerContext.Provider value={handle}>
      {/* The edge drag takes the place of the swipe back, which the list's back button replaces. */}
      <Stack.Screen options={{ gestureEnabled: !enabled }} />
      <View style={styles.root}>
        {enabled ? (
          <GestureDetector gesture={listPan}>
            <View
              style={[styles.list, { width: shift, paddingTop: insets.top, paddingLeft: insets.left }]}
              accessibilityElementsHidden={!open}
              importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
            >
              <View style={styles.head}>
                <GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />
                <View style={[styles.who, owner.kind === 'room' && styles.whoRoom]}>
                  {owner.kind === 'character' ? (
                    // The character's pill of the old list of chats: a tap opens the profile.
                    <Pressable
                      onPress={() => router.push(`/character/${owner.character.id}?profile=1`)}
                      style={styles.whoPress}
                      accessibilityRole="button"
                      accessibilityLabel={t('profile.title')}
                    >
                      <GlassSurface interactive style={styles.whoPill} fallbackStyle={glass.solid}>
                        <Avatar name={owner.character.name} file={owner.character.avatar} size={32} viewable={false} />
                        <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.name} numberOfLines={1}>
                          {owner.character.name}
                        </Text>
                      </GlassSurface>
                    </Pressable>
                  ) : (
                    // The room's pill of the old list of scenes: its menu starts a scene from a
                    // chat of the cast, or opens the room's settings.
                    <NativeMenu items={roomMenu} title={owner.room.name} style={styles.whoPress}>
                      {cast.length > 1 ? (
                        <View style={styles.imessageHeader}>
                          <View style={styles.avatarRow}>
                            <AvatarStack cast={cast} size={34} max={3} viewable={false} />
                          </View>
                          <GlassSurface interactive style={styles.namePill} fallbackStyle={glass.solid}>
                            <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.imessageName} numberOfLines={1}>
                              {owner.room.name}
                            </Text>
                            <Icon name="chevron-forward" size={11} color={colors.textMuted} />
                          </GlassSurface>
                        </View>
                      ) : (
                        <GlassSurface
                          interactive
                          style={[styles.whoPill, !cast.length && styles.whoPillNoAvatar]}
                          fallbackStyle={glass.solid}
                        >
                          {cast.length === 1 ? (
                            <Avatar name={cast[0].name} file={cast[0].avatar} size={32} viewable={false} />
                          ) : null}
                          <View style={styles.nameRow}>
                            <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.name} numberOfLines={1}>
                              {owner.room.name}
                            </Text>
                            <Icon name="chevron-down" size={14} color={colors.textMuted} />
                          </View>
                        </GlassSurface>
                      )}
                    </NativeMenu>
                  )}
                </View>
                <GlassButton icon="create-outline" onPress={startNew} accessibilityLabel={t('chatDrawer.newChat')} />
              </View>
              <ReorderableList
                data={chats}
                keyExtractor={(chat) => String(chat.id)}
                {...reorder}
                contentContainerStyle={[styles.rows, { paddingBottom: insets.bottom + 16 }]}
                ItemSeparatorComponent={RowGap}
                extraData={chatId}
                renderItem={({ item: chat }) => (
                  <DrawerRow
                    chat={chat}
                    active={chat.id === chatId}
                    menuFor={menuFor}
                    onTouch={stage}
                    onTap={rowTap}
                    listPan={listReorder.panGesture}
                  />
                )}
              />
            </View>
          </GestureDetector>
        ) : null}

        <GestureDetector gesture={openPan}>
          <Animated.View style={[styles.chat, chatStyle]}>
            <Animated.View
              style={[styles.clip, clipStyle]}
              accessibilityElementsHidden={open}
              importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
            >
              {children}
              <Animated.View
                pointerEvents="none"
                style={[styles.veil, veilStyle]}
              />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.outline, outlineStyle]} />
            <GestureDetector gesture={strip}>
              <Animated.View
                style={[StyleSheet.absoluteFill, stripStyle]}
                accessible={open}
                accessibilityRole="button"
                accessibilityLabel={t('chatDrawer.close')}
              />
            </GestureDetector>
          </Animated.View>
        </GestureDetector>
      </View>
    </DrawerContext.Provider>
  )
}

const RowGap = () => <View style={{ height: 2 }} />

type RowProps = {
  chat: ChatPreview
  active: boolean
  menuFor: (chat: ChatPreview) => MenuItem[]
  // The finger is down: the chat can be laid out before it lifts.
  onTouch: (chat: ChatPreview) => void
  // A worklet, run on the UI thread as the finger lifts.
  onTap: (chatId: number) => void
  // The list's own pan, which takes any move first: a tap runs alongside it.
  listPan: GestureType
}

// The ellipsis at the end of a row, with its padding: a tap there is the menu's.
const MENU_ZONE = 40

// A chat of the list: its title and last line, the menu behind the ellipsis, and a long
// press to drag it elsewhere.
const DrawerRow = memo(function DrawerRow({ chat, active, menuFor, onTouch, onTap, listPan }: RowProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const drag = useReorderableDrag()
  const when = formatWhen(chat.lastActivity, locale)
  const messages = countLabel(chat.messageCount, 'message', locale)
  const menu = menuFor(chat)
  // The Pressable lights the row and lifts it on a long press; the tap that opens the chat
  // is a gesture of the UI thread, so the drawer moves the moment the finger lifts.
  const rowWidth = useSharedValue(0)
  const id = chat.id
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        // Short of the long press that lifts the row, and still: a scroll of the list is no tap.
        .maxDuration(450)
        .maxDistance(10)
        .simultaneousWithExternalGesture(listPan)
        .onEnd((e, success) => {
          if (success && e.x < rowWidth.value - MENU_ZONE) onTap(id)
        }),
    [id, onTap, listPan, rowWidth]
  )
  return (
    <GestureDetector gesture={tapGesture}>
      <Pressable
        onLayout={(e) => {
          rowWidth.value = e.nativeEvent.layout.width
        }}
        onPressIn={active ? undefined : () => onTouch(chat)}
        onLongPress={drag}
        style={[styles.row, active && styles.rowActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {chat.title ?? when}
          </Text>
          {/* As the cards of the list of chats had it: when and how long, under the title. */}
          <Text style={styles.rowMeta} numberOfLines={1}>
            {chat.title ? `${when}, ${messages}` : messages}
          </Text>
          {/* An unsent message shows in place of the last one, as in Telegram. */}
          {chat.draft ? (
            <Text style={styles.rowPreview} numberOfLines={1}>
              <Text style={styles.rowDraft}>{t('chatDrawer.draft')} </Text>
              {plainPreview(chat.draft)}
            </Text>
          ) : (
            <Text style={styles.rowPreview} numberOfLines={1}>
              {plainPreview(chat.lastMessage ?? '') || t('chatCard.emptyChat')}
            </Text>
          )}
        </View>
        {swiftUI ? (
          // Claims the touch, so the row does not open under the menu.
          <View onStartShouldSetResponder={() => true}>
            <NativeMenu items={menu} title={chat.title ?? when} style={styles.rowMenu}>
              <Icon name="ellipsis-horizontal" size={16} color={colors.textFaint} />
            </NativeMenu>
          </View>
        ) : (
          <IconButton name="ellipsis-horizontal" size={16} color={colors.textFaint} onPress={() => showSheet(chat.title ?? when, menu)} />
        )}
      </Pressable>
    </GestureDetector>
  )
})

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { position: 'absolute', top: 0, bottom: 0, left: 0 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingLeft: 8, paddingRight: 12 },
    who: { flex: 1, alignItems: 'flex-start' },
    whoRoom: { alignItems: 'center' },
    whoPress: { maxWidth: '100%', alignItems: 'center' },
    whoPill: {
      height: 44,
      borderRadius: 22,
      borderCurve: 'continuous',
      paddingLeft: 6,
      paddingRight: 16,
      gap: 10,
      flexDirection: 'row',
      alignItems: 'center',
      maxWidth: '100%',
    },
    whoPillNoAvatar: {
      paddingHorizontal: 16,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    name: { flexShrink: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 18, fontWeight: '600' },
    imessageHeader: {
      alignItems: 'center',
      justifyContent: 'center',
      maxWidth: '100%',
    },
    avatarRow: {
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    namePill: {
      height: 22,
      borderRadius: 11,
      borderCurve: 'continuous',
      paddingHorizontal: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      marginTop: -7,
      zIndex: 2,
      maxWidth: '100%',
    },
    imessageName: {
      flexShrink: 1,
      color: colors.text,
      fontFamily: fonts.prose,
      fontSize: 13,
      fontWeight: '600',
    },
    rows: { paddingHorizontal: 8, paddingTop: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 10,
      paddingLeft: 12,
      paddingRight: 4,
      borderRadius: ROW_RADIUS,
      borderCurve: 'continuous',
      // Solid, so a row lifted by the drag covers the ones it passes over.
      backgroundColor: colors.bg,
    },
    rowText: { flex: 1 },
    rowMenu: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    rowActive: { backgroundColor: colors.surfaceRaised },
    rowTitle: { color: colors.text, fontSize: 16, fontWeight: '500' },
    rowMeta: { color: colors.textFaint, fontSize: 13, marginTop: 2 },
    rowPreview: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
    rowDraft: { color: colors.danger },
    chat: {
      ...FILL,
      shadowColor: '#000',
      shadowOffset: { width: -4, height: 0 },
      shadowRadius: 24,
    },
    clip: { flex: 1, overflow: 'hidden', borderCurve: 'continuous', backgroundColor: colors.bg },
    // Over the chat's own floating header and composer, which stand above its content.
    veil: { ...FILL, zIndex: 100, backgroundColor: '#000' },
    outline: {
      ...FILL,
      borderRadius: CORNER,
      borderCurve: 'continuous',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
    },
  })
