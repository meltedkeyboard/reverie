import { useRouter } from 'expo-router'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { KeyboardController } from 'react-native-keyboard-controller'
import Animated, { FadeIn, FadeOut, type SharedValue } from 'react-native-reanimated'

import { AvatarStack, castGallery } from '@/components/cast/AvatarStack'
import { CastBar, FloorButton, FLOOR_ICONS } from '@/components/cast/CastBar'
import { CastSheet } from '@/components/cast/CastSheet'
import { AsidePanel } from '@/components/chat/AsidePanel'
import type { RowMessage, RowScene } from '@/components/chat/MessageRow'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import type { ChromeData, RowConfig, ThreadData } from '@/components/chat/thread/screen'
import type { Store } from '@/components/chat/thread/store'
import { GlassSurface } from '@/components/chrome/Glass'
import { bubbleOpacityOf } from '@/components/chrome/ChatChrome'
import { useChatTextSettings } from '@/lib/chat/chatText'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { useOpenViewer } from '@/components/visuals/ImageLink'
import type { Chat } from '@/db/chats'
import { getDraft, setDraft } from '@/db/drafts'
import { newMessage, type Message } from '@/db/messages'
import { useDatabase } from '@/db/provider'
import { setMemberMuted, setRoomFloor, type FloorMode, type Room, type RoomMember } from '@/db/rooms'
import { useAside } from '@/hooks/chat/useAside'
import { useChatMenuActions, useMessageActions } from '@/hooks/chat/useChatScreenActions'
import { useRoom, type RoomPhase } from '@/hooks/chat/useRoom'
import { useSuggestion } from '@/hooks/chat/useSuggestion'
import { useChatSwitches } from '@/hooks/util/useStoredFlag'
import { useTranslation } from '@/i18n'
import { roomScene } from '@/lib/chat/aside'
import { promptRenameChat } from '@/lib/chat/chatDialogs'
import { USER } from '@/lib/chat/room/audience'
import { isDesktop } from '@/lib/core/platform'
import { countLabel } from '@/lib/core/format'
import { showSheet } from '@/lib/ui/dialogs'
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
}

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
}: Props) {
  const chatId = chat.id
  const db = useDatabase()
  const router = useRouter()
  const openViewer = useOpenViewer()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const floor = room.floor

  const {
    messages,
    loaded,
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

  const [editingRow, setEditingRow] = useState<RowMessage | null>(null)
  const [addressees, setAddressees] = useState<number[]>([])
  const [whisper, setWhisper] = useState(false)
  const [narration, setNarration] = useState(false)
  const [castOpen, setCastOpen] = useState(false)
  const { suggestEnabled } = useChatSwitches()

  const openCast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (KeyboardController.isVisible()) await KeyboardController.dismiss({ animated: true })
    setCastOpen(true)
  }

  const scene = useMemo(() => roomScene(room, members), [room, members])
  const aside = useAside(scene, messages)
  // The eye in the header opens a private thread with the model about the scene; while it
  // is open the field talks to the model, so who is addressed does not matter.
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

  const onAction = useMessageActions({ regenerate, removeRefine, removeVariant, removeMessage, edit: setEditingRow })
  const { confirmDelete, suggestName } = useChatMenuActions({ chatId, title, rename, autoName, discard, onDeleted })

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

  // Opened from the cast sheet. What leads back to the scene or away from it closes the
  // sheet; muting and walking in or out stay there, so the change is seen in the list.
  const memberMenu = (member: RoomMember) => {
    // A tap on a row in the cast sheet picks who is addressed, so the photo is here.
    const avatar = castGallery([member.character])
    const showAvatar = avatar.length ? [{ label: t('chat.menuShowAvatar'), onSelect: () => openViewer(avatar) }] : []
    const openCharacter = {
      label: t('room.openCharacter'),
      onSelect: () => {
        setCastOpen(false)
        router.push(`/character/${member.characterId}`)
      },
    }
    if (!member.present) {
      return showSheet(member.character.name, [
        ...(idle ? [{ label: t('room.enter'), onSelect: () => togglePresent(member) }] : []),
        ...showAvatar,
        openCharacter,
      ])
    }
    const picked = !narration && addressees.includes(member.characterId)
    const actions = [
      {
        label: picked ? t('room.removeAddressee') : t('room.addAddressee'),
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
              onSelect: () => {
                setCastOpen(false)
                nudge(member.characterId)
                scrollToNewest()
              },
            },
          ]
        : []),
      {
        label: t('room.whisperToMember'),
        onSelect: () => {
          setCastOpen(false)
          setNarration(false)
          setAddressees([member.characterId])
          setWhisper(true)
        },
      },
      { label: member.muted ? t('room.unmute') : t('room.mute'), onSelect: () => toggleMuted(member) },
      ...(idle ? [{ label: t('room.leave'), onSelect: () => togglePresent(member) }] : []),
      ...showAvatar,
      openCharacter,
    ]
    showSheet(member.character.name, actions)
  }

  const changeFloor = (mode: FloorMode) => {
    if (mode === floor) return
    Haptics.selectionAsync()
    onRoomChange({ ...room, floor: mode })
    setRoomFloor(db, room.id, mode)
  }

  const chooseAutoplay = () => {
    if (!idle || !members.some((m) => m.present && !m.muted)) return
    showSheet(
      t('room.autoplayTitle'),
      AUTOPLAY_LENGTHS.map((count) => ({
        label: countLabel(count, 'line', locale),
        onSelect: () => {
          autoplay(count)
          scrollToNewest()
        },
      }))
    )
  }

  // The cast in the header is the menu's trigger, so their photos open from the menu.
  const gallery = castGallery(members.map((m) => m.character))
  const chatMenu: MenuItem[] = [
    ...(gallery.length ? [{ label: t('room.menuShowAvatars'), systemImage: 'photo.on.rectangle', onSelect: () => openViewer(gallery) }] : []),
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: () => promptRenameChat(title, rename) },
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
    { label: t('room.menuAutoplay'), systemImage: 'bubble.left.and.bubble.right', onSelect: chooseAutoplay },
    { label: t('room.menuEditRoom'), systemImage: 'slider.horizontal.3', onSelect: () => router.push(`/room/${room.id}`) },
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

  const initialCount = room.opening.trim() ? 1 : 0
  // Nothing written yet: a new scene from here would be the same as this one.
  const fresh = loaded && !rows.some((r) => r.role === 'user') && rows.length <= initialCount

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
            {idle ? null : status}
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
          members.some((m) => m.present && !m.muted) && !asideOpen
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

  return (
    <CastSheet
      look={room}
      visible={castOpen}
      onClose={() => setCastOpen(false)}
      members={members}
      addressees={addressees}
      narration={narration}
      onChangeAddressees={(ids) => {
        setNarration(false)
        setAddressees(ids)
        // A whisper stays on while picking whom to whisper to, but not for the whole room.
        if (!ids.length) setWhisper(false)
      }}
      onNarrate={() => {
        setWhisper(false)
        setNarration(true)
      }}
      whisper={whisper}
      onToggleWhisper={() => setWhisper((on) => !on)}
      speakingId={draft?.speakerId ?? null}
      queuedIds={queue.map((p) => p.characterId)}
      canMove={idle}
      onTogglePresent={togglePresent}
      onMemberMenu={memberMenu}
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

// The room's photos, name and scenario above its first line, and in the middle of an empty scene.
export function RoomIntro({ room, members, hint }: { room: Room; members: RoomMember[]; hint?: string }) {
  const styles = useStyles(createStyles)
  const cast = useMemo(() => members.map((m) => ({ name: m.character.name, avatar: m.character.avatar })), [members])
  return (
    <View style={styles.intro}>
      <AvatarStack cast={cast} size={56} max={4} />
      <Text style={styles.introName}>{room.name}</Text>
      {room.scenario.trim() ? <Text style={styles.introScenario}>{room.scenario.trim()}</Text> : null}
      {hint ? <Text style={styles.introMeta}>{hint}</Text> : null}
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
