import { useRouter } from 'expo-router'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { KeyboardController } from 'react-native-keyboard-controller'
import Animated, { FadeIn, FadeOut, type SharedValue } from 'react-native-reanimated'

import { castGallery } from '@/components/cast/AvatarStack'
import { CastMosaic } from '@/components/cast/CastMosaic'
import { CastBar, FloorButton, FLOOR_ICONS } from '@/components/cast/CastBar'
import { CastSheet, type CastProps } from '@/components/cast/CastSheet'
import { AsidePanel } from '@/components/chat/AsidePanel'
import type { RowMessage, RowScene } from '@/components/chat/MessageRow'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import type { ChromeData, RowConfig, ThreadData } from '@/components/chat/thread/screen'
import type { Store } from '@/components/chat/thread/store'
import { useChatDrawer } from '@/components/chrome/ChatDrawer'
import { GlassSurface } from '@/components/chrome/Glass'
import { bubbleOpacityOf } from '@/components/chrome/ChatChrome'
import { useChatTextSettings } from '@/lib/chat/chatText'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { Icon } from '@/components/visuals/Icon'
import { useOpenViewer } from '@/components/visuals/ImageLink'
import { getChat, listChats, type Chat } from '@/db/chats'
import { getDraft, setDraft } from '@/db/drafts'
import { newMessage, type Message } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { importChatToRoom, setMemberMuted, setRoomFloor, type FloorMode, type Room, type RoomMember } from '@/db/rooms'
import { useAside } from '@/hooks/chat/useAside'
import { useBranch, useChatMenuActions, useMessageActions } from '@/hooks/chat/useChatScreenActions'
import { useRoom, type RoomPhase } from '@/hooks/chat/useRoom'
import { useMemoryMenu } from '@/hooks/chat/useLongMemory'
import { useSuggestion } from '@/hooks/chat/useSuggestion'
import { useChatSwitches } from '@/hooks/util/useStoredFlag'
import { useTranslation } from '@/i18n'
import { roomScene } from '@/lib/chat/aside'
import { USER } from '@/lib/chat/room/audience'
import { castSession, closeCastSession, openCastSession } from '@/lib/chat/castSession'
import { isDesktop, isIOS } from '@/lib/core/platform'
import { countLabel, formatWhen } from '@/lib/core/format'
import { showMessage, showSheet } from '@/lib/ui/dialogs'
import { reportError } from '@/lib/transfer/report'
import * as Haptics from '@/lib/ui/haptics'
import { CONTROL_FONT_SCALE, fonts, useColors, useStyles, type Colors } from '@/theme'

const FLOORS: FloorMode[] = ['addressee', 'reactions', 'open']
const AUTOPLAY_LENGTHS = [3, 5, 10]

// Who said a line of a room, to whom, and who else heard it, for its row. Also used for a
// scene laid out ahead, before its controller has taken over.
export function useSceneOf(members: RoomMember[] | null) {
  const colors = useColors()
  const { t } = useTranslation()
  return useMemo(() => {
    if (!members) return undefined
    const byId = new Map(members.map((m) => [m.characterId, m]))
    const nameOf = (id: number) => byId.get(id)?.character.name ?? t('room.leftRoom')
    return (m: Message): RowScene => {
      const member = m.speakerId !== null ? byId.get(m.speakerId) : undefined
      const speaker = member
        ? { name: member.character.name, avatar: member.character.avatar, color: colors.cast[member.position % colors.cast.length] }
        : m.speakerId !== null
          ? { name: t('room.leftRoom'), avatar: null, color: colors.textFaint }
          : null
      const to = (m.addressees ?? []).filter((id) => id !== USER && id !== m.speakerId).map(nameOf)
      const hearers = (m.audience ?? []).filter((id) => id !== m.speakerId).map(nameOf)
      if (m.audience && m.role === 'assistant') hearers.push(t('room.you'))
      return {
        speaker,
        to: to.length ? to.join(', ') : null,
        whisper: m.audience ? hearers.join(', ') || t('room.you') : null,
        overheard: m.overheard.length ? m.overheard.map(nameOf).join(', ') : null,
      }
    }
  }, [members, colors, t])
}

type Props = {
  chat: Chat
  room: Room
  members: RoomMember[]
  // Muting someone, people walking in and out and the floor are saved at once and shown
  // by the whole screen (the header's cast, the rows) without waiting for it to reload.
  onRoomChange: (room: Room) => void
  onMembersChange: (members: RoomMember[]) => void
  // The thread the scene is on, and the screen's header and composer.
  thread: Store<ThreadData>
  chrome: Store<ChromeData | null>
  focusMessageId: number | null
  composerHeight: SharedValue<number>
  scrollToNewest: () => void
  onDeleted: () => void
  // Shows another scene of the room on the screen: one just started from a chat.
  onShow: (chat: Chat) => void
}

// How many chats of the cast a room offers to start a scene from.
const IMPORT_CHOICES = 12

// The logic of the scene on screen, the room's counterpart of ChatController: it hands
// the rows to its thread, and the cast bar, the status and the menu to the header and the
// composer. Its only view is the sheet of the cast.
export function RoomController({
  chat,
  room,
  members,
  onRoomChange,
  onMembersChange,
  thread,
  chrome,
  focusMessageId,
  composerHeight,
  scrollToNewest,
  onDeleted,
  onShow,
}: Props) {
  const chatId = chat.id
  const db = useDatabase()
  const router = useRouter()
  const openViewer = useOpenViewer()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const floor = room.floor

  const {
    memory,
    direction,
    messages,
    loaded,
    sceneState,
    draft,
    phase,
    error,
    title,
    naming,
    replacingId,
    queue,
    auto,
    thinking,
    toggleThinking,
    persona,
    personaId,
    selectPersona,
    send,
    stop,
    proceed,
    nudge,
    autoplay,
    setPresent,
    regenerate,
    retry,
    selectVariant,
    editMessage,
    removeRefine,
    removeVariant,
    removeMessage,
    discard,
    rename,
    autoName,
  } = useRoom(chat, room, members, onMembersChange)

  const memoryMenu = useMemoryMenu(memory)
  const [editingRow, setEditingRow] = useState<RowMessage | null>(null)
  const [addressees, setAddressees] = useState<number[]>([])
  const [whisper, setWhisper] = useState(false)
  const [narration, setNarration] = useState(false)
  const [castOpen, setCastOpen] = useState(false)
  const { suggestEnabled } = useChatSwitches()

  // While a sheet is up over the scene its drawer is off: the touch on the cast button that
  // opened it begins the drawer's drag too, and with the sheet taking the screen the drag
  // would never end (see suspend in ChatDrawer).
  const drawer = useChatDrawer()
  const openCast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (KeyboardController.isVisible()) await KeyboardController.dismiss({ animated: true })
    drawer?.suspend(true)
    setCastOpen(true)
    if (!isIOS) return
    // On iOS the system's sheet, a route of its own, which reads the cast from castSession.
    openCastSession(castProps(), () => {
      setCastOpen(false)
      drawer?.suspend(false)
    })
    router.push('/cast')
  }
  // Takes the sheet away; `then` waits until it is gone, as a screen pushed or the viewer
  // must not start while the system's sheet is still going away.
  const closeCast = (then?: () => void) => {
    if (isIOS) return closeCastSession(then)
    setCastOpen(false)
    then?.()
  }

  const scene = useMemo(() => roomScene(room, members), [room, members])
  const aside = useAside(scene, messages)
  // Private, in the header's menu, opens a private thread with the model about the scene;
  // while it is open the field talks to the model, so who is addressed does not matter.
  const [asideOpen, setAsideOpen] = useState(false)
  // What was typed to the characters waits here while the field asks the model aside, and
  // stays as the scene's draft until it is sent.
  const sceneDraft = useRef(getDraft(chatId))
  const toggleAside = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (asideOpen) aside.reset()
    else setEditingRow(null)
    setAsideOpen(!asideOpen)
  }

  // Someone removed from the room, or out of the scene, can't stay picked.
  useEffect(() => {
    setAddressees((ids) => ids.filter((id) => members.some((m) => m.characterId === id && m.present)))
  }, [members])

  const idle = phase === 'idle'
  const [suggestion, clearSuggestion, dismissSuggestion] = useSuggestion(scene, messages, suggestEnabled && idle && !asideOpen && !editingRow)
  const locked = !idle || editingRow !== null
  const byId = useMemo(() => new Map(members.map((m) => [m.characterId, m])), [members])
  const nameOf = useCallback((id: number) => byId.get(id)?.character.name ?? t('room.leftRoom'), [byId, t])
  const sceneOf = useSceneOf(members)

  // A regenerated line streams in place of the old one; a new line streams at the end.
  const rows = useMemo(() => {
    const streaming: RowMessage | null = draft
      ? {
          ...newMessage(-1, chatId, 'assistant', draft.text, {
            speakerId: draft.speakerId,
            kind: draft.kind,
            addressees: draft.addressees,
            audience: draft.audience,
          }, 0),
          streaming: true,
          reasoning: draft.reasoning ?? undefined,
          reasoningMs: draft.reasoningMs,
          refine: draft.refine ?? undefined,
        }
      : null
    const list: RowMessage[] = messages.map((m) => (m.id === replacingId && streaming ? streaming : m))
    if (streaming && replacingId === null) list.push(streaming)
    return list
  }, [messages, replacingId, draft, chatId])

  const regenerable = useMemo(
    () =>
      new Set(
        messages
          .filter((m) => m.role === 'assistant' && m.kind !== 'narration' && m.speakerId !== null && byId.has(m.speakerId))
          .map((m) => m.id)
      ),
    [messages, byId]
  )

  const branch = useBranch(chatId, title, onShow)
  const onAction = useMessageActions({ regenerate, removeRefine, removeVariant, removeMessage, edit: setEditingRow, branch })
  const { confirmDelete, promptRename, suggestName } = useChatMenuActions({ chatId, title, rename, autoName, discard, onDeleted })

  const { pattern, wallpaper } = useChatTextSettings()
  const bubbleOpacity = bubbleOpacityOf(room, wallpaper, pattern)
  const config = useMemo<RowConfig>(
    () => ({ regenerable, locked, onAction, onSelectVariant: selectVariant, bubbleOpacity, sceneOf }),
    [regenerable, locked, onAction, selectVariant, bubbleOpacity, sceneOf]
  )

  // Until its messages are in, the thread keeps what it shows: the scene as it was laid
  // out ahead, the same messages.
  useLayoutEffect(() => {
    if (!loaded) return
    thread.set({ chat, rows, loaded, config, error, onRetry: retry, focusId: focusMessageId })
  })

  const toggleMuted = async (member: RoomMember) => {
    await setMemberMuted(db, room.id, member.characterId, !member.muted)
    onMembersChange(members.map((m) => (m.characterId === member.characterId ? { ...m, muted: !m.muted } : m)))
  }

  const togglePresent = async (member: RoomMember) => {
    await setPresent(member.characterId, !member.present)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }

  // A long press on someone in the cast sheet. What leads back to the scene or away from it
  // closes the sheet; muting and walking in or out stay there, so the change is seen in the list.
  const memberItems = (member: RoomMember): MenuItem[] => {
    // A tap on a row in the cast sheet picks who is addressed, so the photo is here.
    const avatar = castGallery([member.character])
    const showAvatar: MenuItem[] = avatar.length
      ? [{ label: t('chat.menuShowAvatar'), systemImage: 'photo', onSelect: () => closeCast(() => openViewer(avatar)) }]
      : []
    const openProfile: MenuItem = {
      label: t('chat.menuShowProfile'),
      systemImage: 'person.crop.circle',
      onSelect: () => closeCast(() => router.push(`/character/${member.characterId}?profile=1`)),
    }
    if (!member.present) {
      return [
        ...(idle ? [{ label: t('room.enter'), systemImage: 'figure.walk', onSelect: () => togglePresent(member) }] : []),
        ...showAvatar,
        openProfile,
      ]
    }
    const picked = !narration && addressees.includes(member.characterId)
    return [
      {
        label: picked ? t('room.removeAddressee') : t('room.addAddressee'),
        systemImage: picked ? 'person.badge.minus' : 'person.badge.plus',
        onSelect: () => {
          const id = member.characterId
          setAddressees(picked ? addressees.filter((a) => a !== id) : [...(narration ? [] : addressees), id])
          setNarration(false)
        },
      },
      ...(idle
        ? [
            {
              label: t('room.letSpeak'),
              systemImage: 'text.bubble',
              onSelect: () => {
                closeCast()
                nudge(member.characterId)
                scrollToNewest()
              },
            },
          ]
        : []),
      {
        label: t('room.whisperToMember'),
        systemImage: 'lock',
        onSelect: () => {
          closeCast()
          setNarration(false)
          setAddressees([member.characterId])
          setWhisper(true)
        },
      },
      {
        label: member.muted ? t('room.unmute') : t('room.mute'),
        systemImage: member.muted ? 'speaker.wave.2' : 'speaker.slash',
        onSelect: () => toggleMuted(member),
      },
      ...(idle
        ? [{ label: t('room.leave'), systemImage: 'rectangle.portrait.and.arrow.right', onSelect: () => togglePresent(member) }]
        : []),
      ...showAvatar,
      openProfile,
    ]
  }

  const changeFloor = (mode: FloorMode) => {
    if (mode === floor) return
    Haptics.selectionAsync()
    onRoomChange({ ...room, floor: mode })
    setRoomFloor(db, room.id, mode)
  }

  // Someone is there to talk: present and not only listening.
  const canTalk = members.some((m) => m.present && !m.muted)
  const autoplayItems: MenuItem[] = AUTOPLAY_LENGTHS.map((count) => ({
    label: countLabel(count, 'line', locale),
    onSelect: () => {
      if (!idle || !canTalk) return
      autoplay(count)
      scrollToNewest()
    },
  }))
  // For the long press on Continue, which has no menu of its own to grow out of.
  const chooseAutoplay = () => {
    if (!idle || !canTalk) return
    showSheet(t('room.autoplayTitle'), autoplayItems)
  }

  // Any one-on-one chat of someone in the room can seed a new scene here; the original
  // stays put. The scene then takes the place of this one, as a new one would.
  const importScene = async () => {
    const found = (
      await Promise.all(members.map(async (m) => (await listChats(db, m.characterId)).map((c) => ({ chat: c, name: m.character.name }))))
    )
      .flat()
      .filter(({ chat: c }) => c.messageCount > 1)
      .sort((a, b) => b.chat.lastActivity - a.chat.lastActivity)
      .slice(0, IMPORT_CHOICES)
    if (!found.length) return showMessage(t('rooms.importNothingTitle'), t('rooms.importNothingMessage'))
    showSheet(
      t('rooms.importTitle'),
      found.map(({ chat: c, name }) => ({
        label: `${name}: ${c.title ?? formatWhen(c.lastActivity, locale)}`,
        onSelect: async () => {
          try {
            const { chatId: sceneId } = await importChatToRoom(db, c.id, room.id)
            const scene = await getChat(db, sceneId)
            if (scene) onShow(scene)
          } catch (err) {
            reportError(t('rooms.importFailed'), err)
          }
        },
      }))
    )
  }

  const chatMenu: MenuItem[] = [
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: promptRename },
    { label: t('chat.menuSuggestTitle'), systemImage: 'sparkles', onSelect: suggestName },
    {
      label: t('room.floorTitle'),
      systemImage: 'person.wave.2',
      children: FLOORS.map((mode) => ({
        label: t(`room.floor.${mode}`),
        systemImage: mode === floor ? 'checkmark' : FLOOR_ICONS[mode].sf,
        onSelect: () => changeFloor(mode),
      })),
    },
    ...(canTalk ? [{ label: t('room.menuAutoplay'), systemImage: 'bubble.left.and.bubble.right', children: autoplayItems }] : []),
    { label: t('room.menuImportScene'), systemImage: 'square.and.arrow.down', onSelect: importScene },
    { label: t('chat.menuShowProfile'), systemImage: 'person.2.circle', onSelect: () => router.push(`/room/${room.id}?profile=1`) },
    ...direction.menu,
    ...memoryMenu,
    { label: t('chat.menuDeleteChat'), systemImage: 'trash', destructive: true, separated: true, onSelect: confirmDelete },
  ]

  const editing = useMemo(() => (editingRow ? { id: editingRow.id, text: editingRow.content } : null), [editingRow])

  const placeholder = narration
    ? t('room.placeholderNarration')
    : !addressees.length
      ? t('room.placeholderEveryone')
      : whisper
        ? t('room.placeholderWhisper', { names: addressees.map(nameOf).join(', ') })
        : t('room.placeholderTo', { names: addressees.map(nameOf).join(', ') })

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

  const status = <Status phase={phase} draftSpeaker={draft ? nameOf(draft.speakerId) : null} next={queue.map((p) => nameOf(p.characterId))} auto={auto} />

  useLayoutEffect(() => {
    chrome.set({
      chatId,
      title,
      naming,
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
        placeholder: asideOpen ? t('chat.privatePlaceholder') : placeholder,
        suggestion,
        onSuggestionTaken: clearSuggestion,
        onSuggestionDismissed: dismissSuggestion,
        thinking: asideOpen ? undefined : thinking,
        onToggleThinking: asideOpen ? undefined : toggleThinking,
        persona: asideOpen ? undefined : persona,
        personaId: asideOpen ? undefined : personaId,
        onSelectPersona: asideOpen ? undefined : selectPersona,
        hushed: asideOpen || (whisper && addressees.length > 0 && !narration),
        toolbar:
          members.length && !asideOpen ? (
            <>
              <CastBar members={members} addressees={addressees} whisper={whisper} narration={narration} onOpen={openCast} />
              <FloorButton floor={floor} onChange={changeFloor} />
            </>
          ) : null,
        accessory: asidePanel ?? (
          <View style={styles.accessory} pointerEvents="box-none">
            {idle ? sceneState.trim() ? <SceneState text={sceneState.trim()} /> : null : status}
          </View>
        ),
        onSend: (text, images) => {
          if (asideOpen) return void aside.ask(text, images)
          send(text, images, { addressees, whisper, narration })
          setWhisper(false)
          setNarration(false)
          scrollToNewest()
        },
        onStop: asideOpen ? aside.stop : stop,
        onContinue:
          canTalk && !asideOpen
            ? () => {
                proceed()
                scrollToNewest()
              }
            : undefined,
        onContinueLongPress: asideOpen ? undefined : chooseAutoplay,
        onSubmitEdit: async (text) => {
          if (editingRow) await editMessage(editingRow.id, text)
          setEditingRow(null)
        },
        onCancelEdit: () => setEditingRow(null),
      },
    })
  })

  // What the cast sheet shows, the app's own or the system's.
  function castProps(): CastProps {
    return {
      look: room,
      members,
      addressees,
      narration,
      onChangeAddressees: (ids) => {
        setNarration(false)
        setAddressees(ids)
        // A whisper stays on while picking whom to whisper to, but not for the whole room.
        if (!ids.length) setWhisper(false)
      },
      onNarrate: () => {
        setWhisper(false)
        setNarration(true)
      },
      whisper,
      onToggleWhisper: () => setWhisper((on) => !on),
      speakingId: draft?.speakerId ?? null,
      queuedIds: queue.map((p) => p.characterId),
      canMove: idle,
      onTogglePresent: togglePresent,
      memberMenu: memberItems,
    }
  }

  // The system's sheet follows the scene while it is up: who speaks, who is picked.
  useLayoutEffect(() => {
    if (isIOS && castOpen) castSession.set(castProps())
  })
  // A scene going away with its sheet up takes the sheet with it.
  useEffect(() => () => closeCastSession(), [])

  if (isIOS) return null
  return (
    <CastSheet
      {...castProps()}
      visible={castOpen}
      onClose={() => setCastOpen(false)}
      onDismissed={() => drawer?.suspend(false)}
    />
  )
}

type StatusProps = {
  phase: RoomPhase
  draftSpeaker: string | null
  next: string[]
  auto: { done: number; total: number } | null
}

// Who is talking now and who comes next, or that the director is still deciding.
function Status({ phase, draftSpeaker, next, auto }: StatusProps) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const now =
    phase === 'staging'
      ? t('room.statusStaging')
      : phase === 'plotting'
        ? t('room.statusPlotting')
        : phase === 'directing' || !draftSpeaker
        ? t('room.statusDeciding')
        : t('room.statusSpeaking', { name: draftSpeaker })
  const then = next.length ? t('room.statusNext', { names: next.join(', ') }) : ''
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={styles.statusSlot}>
      <GlassSurface style={styles.status} fallbackStyle={styles.statusSolid}>
        <View style={styles.statusDots}>
          <TypingIndicator />
        </View>
        <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={styles.statusText} numberOfLines={1}>
          {now}
          {then ? <Text style={styles.statusFaint}>{` · ${then}`}</Text> : null}
        </Text>
        {auto ? (
          <Text style={styles.statusAuto}>{t('room.statusAuto', { done: auto.done, total: auto.total })}</Text>
        ) : null}
      </GlassSurface>
    </Animated.View>
  )
}

// Where the scene stands, as the director last noted it, while nobody is talking: a quiet
// line in the place of the status.
function SceneState({ text }: { text: string }) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={styles.statusSlot}>
      <GlassSurface style={styles.status} fallbackStyle={styles.statusSolid}>
        <Icon name="location-outline" size={13} color={colors.textMuted} />
        <Text
          maxFontSizeMultiplier={CONTROL_FONT_SCALE}
          style={[styles.statusText, styles.statusFaint]}
          numberOfLines={1}
          accessibilityLabel={t('room.sceneState', { state: text })}
        >
          {text}
        </Text>
      </GlassSurface>
    </Animated.View>
  )
}

// The room's cast, name and scenario above its first line, and in the middle of an empty
// scene, as a character's photo and name stand over its chat: the cast as one round picture
// of the same size, and under the scenario the day the scene began, or the hint.
export function RoomIntro({ room, members, createdAt, hint }: { room: Room; members: RoomMember[]; createdAt?: number; hint?: string }) {
  const styles = useStyles(createStyles)
  const { locale } = useTranslation()
  const cast = useMemo(() => members.map((m) => ({ name: m.character.name, avatar: m.character.avatar })), [members])
  const meta = hint ?? (createdAt ? formatWhen(createdAt, locale) : null)
  return (
    <View style={styles.intro}>
      <CastMosaic cast={cast} name={room.name} size={72} round viewable />
      <Text style={styles.introName}>{room.name}</Text>
      {room.scenario.trim() ? <Text style={styles.introScenario}>{room.scenario.trim()}</Text> : null}
      {meta ? <Text style={styles.introMeta}>{meta}</Text> : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    intro: { alignItems: 'center', paddingTop: 24, paddingBottom: 20, paddingHorizontal: 32 },
    introName: { color: colors.text, fontFamily: fonts.prose, fontSize: 22, marginTop: 12, textAlign: 'center' },
    introScenario: {
      color: colors.textMuted,
      fontFamily: fonts.prose,
      fontStyle: 'italic',
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
      textAlign: 'center',
    },
    introMeta: { color: colors.textFaint, fontSize: 14, marginTop: 8, textAlign: 'center' },
    accessory: { alignItems: 'center' },
    statusSlot: { marginBottom: 12 },
    status: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingLeft: 12,
      paddingRight: 8,
      borderRadius: 18,
      maxWidth: 360,
    },
    statusSolid: { backgroundColor: colors.surfaceRaised, borderWidth: isDesktop ? 0 : 1, borderColor: colors.border },
    statusDots: { transform: [{ scale: 0.7 }], marginHorizontal: -6 },
    statusText: { color: colors.text, fontSize: 13, flexShrink: 1 },
    statusFaint: { color: colors.textMuted },
    statusAuto: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '600',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.accentSoft,
    },
  })
