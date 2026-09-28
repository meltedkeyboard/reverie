import Ionicons from '@expo/vector-icons/Ionicons'
import * as Clipboard from 'expo-clipboard'
import { Link, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, StyleSheet, Text, View } from 'react-native'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AsidePanel } from '@/components/AsidePanel'
import { AvatarStack, castGallery } from '@/components/AvatarStack'
import { CastBar, FloorButton } from '@/components/CastBar'
import { CastSheet } from '@/components/CastSheet'
import { ChatBackground } from '@/components/ChatBackground'
import { Composer, ComposerSwap } from '@/components/Composer'
import { ConversationList, ErrorCard, JumpButton, type ConversationHandle } from '@/components/ConversationList'
import { GlassButton, GlassSurface } from '@/components/Glass'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { useOpenViewer } from '@/components/ImageLink'
import { MessageRow, type RowMessage, type RowScene } from '@/components/MessageRow'
import { NativeMenu, nativeMenuGlass, type MenuItem } from '@/components/NativeMenu'
import { SFIcon } from '@/components/SFIcon'
import { TextSheet } from '@/components/TextSheet'
import { TypingIndicator } from '@/components/TypingIndicator'
import { deleteChat, type Chat } from '@/db/chats'
import { newMessage, type Message } from '@/db/messages'
import { isPrivateChatEnabled } from '@/db/privateChat'
import { useDatabase } from '@/db/provider'
import { setMemberMuted, setRoomFloor, type FloorMode, type Room, type RoomMember } from '@/db/rooms'
import { useAside } from '@/hooks/useAside'
import { useRoom, type RoomPhase } from '@/hooks/useRoom'
import { useTranslation } from '@/i18n'
import { roomScene } from '@/lib/aside'
import { avatarUri } from '@/lib/avatars'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chatDialogs'
import { promptText, showMessage, showSheet } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import { plural } from '@/lib/format'
import * as Haptics from '@/lib/haptics'
import type { MessageAction } from '@/lib/messageActions'
import { liquidGlass } from '@/lib/nativeUI'
import { USER } from '@/lib/room/audience'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

const FLOORS: FloorMode[] = ['addressee', 'reactions', 'open']
const AUTOPLAY_LENGTHS = [3, 5, 10]

type Props = { chat: Chat; room: Room; members: RoomMember[]; focusMessageId?: number | null }

// A scene in a room: several characters, a cast bar to pick who is spoken to, and a
// status line saying who is talking and who is next.
export function RoomView({ chat, room: initialRoom, members: initialMembers, focusMessageId }: Props) {
  const chatId = chat.id
  const db = useDatabase()
  const router = useRouter()
  const openViewer = useOpenViewer()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const keyboard = useReanimatedKeyboardAnimation()

  // Muting someone or switching the floor from here is saved at once and shown without
  // waiting for the screen to reload the room.
  const [members, setMembers] = useState(initialMembers)
  const [floor, setFloor] = useState(initialRoom.floor)
  useEffect(() => setMembers(initialMembers), [initialMembers])
  useEffect(() => setFloor(initialRoom.floor), [initialRoom.floor])
  const room = useMemo(() => ({ ...initialRoom, floor }), [initialRoom, floor])

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
    removeMessage,
    discard,
    rename,
    autoName,
  } = useRoom(chat, room, members, setMembers)

  const listRef = useRef<ConversationHandle>(null)
  const composerHeight = useSharedValue(0)
  const [editingRow, setEditingRow] = useState<RowMessage | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [awayFromEnd, setAwayFromEnd] = useState(false)
  const [addressees, setAddressees] = useState<number[]>([])
  const [whisper, setWhisper] = useState(false)
  const [narration, setNarration] = useState(false)
  const [castOpen, setCastOpen] = useState(false)
  const [privateEnabled, setPrivateEnabled] = useState(true)
  useEffect(() => {
    isPrivateChatEnabled(db).then(setPrivateEnabled)
  }, [db])

  // A private thread with the model about the scene, as in a one-on-one chat. While it is
  // open the field talks to the model, so who is addressed does not matter.
  const [asideOpen, setAsideOpen] = useState(false)
  // What was typed to the characters waits here while the field asks the model aside.
  const sceneDraft = useRef('')
  const scene = useMemo(() => roomScene(room, members), [room, members])
  const aside = useAside(scene, messages)
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
  const locked = !idle || editingRow !== null
  const byId = useMemo(() => new Map(members.map((m) => [m.characterId, m])), [members])
  const nameOf = useCallback((id: number) => byId.get(id)?.character.name ?? t('room.leftRoom'), [byId, t])

  const sceneOf = useCallback(
    (m: Message): RowScene => {
      const member = m.speakerId !== null ? byId.get(m.speakerId) : undefined
      const speaker = member
        ? {
            name: member.character.name,
            avatar: member.character.avatar,
            color: colors.cast[member.position % colors.cast.length],
          }
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
    },
    [byId, nameOf, colors, t]
  )

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
        }
      : null
    const list: RowMessage[] = messages.map((m) => (m.id === replacingId && streaming ? streaming : m))
    if (streaming && replacingId === null) list.push(streaming)
    return list.reverse()
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
      } else if (action === 'edit') setEditingRow(message)
      else removeMessage(message.id)
    },
    [regenerate, removeMessage, t]
  )

  const bubbleOpacity = room.background ? 1 - room.backgroundBubbleTransparency : 1
  const renderRow = useCallback(
    (row: RowMessage) => (
      <MessageRow
        message={row}
        canRegenerate={regenerable.has(row.id)}
        locked={locked}
        onAction={onAction}
        onSelectVariant={selectVariant}
        bubbleOpacity={bubbleOpacity}
        scene={sceneOf(row)}
      />
    ),
    [regenerable, locked, onAction, selectVariant, bubbleOpacity, sceneOf]
  )

  const toggleMuted = async (member: RoomMember) => {
    await setMemberMuted(db, room.id, member.characterId, !member.muted)
    setMembers((list) => list.map((m) => (m.characterId === member.characterId ? { ...m, muted: !m.muted } : m)))
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
    setFloor(mode)
    setRoomFloor(db, room.id, mode)
  }

  const chooseFloor = () => {
    showSheet(
      t('room.floorTitle'),
      FLOORS.map((mode) => ({
        label: `${t(`room.floor.${mode}`)}${mode === floor ? t('room.floorCurrent') : ''}`,
        onSelect: () => changeFloor(mode),
      }))
    )
  }

  const chooseAutoplay = () => {
    if (!idle || !members.some((m) => m.present && !m.muted)) return
    showSheet(
      t('room.autoplayTitle'),
      AUTOPLAY_LENGTHS.map((count) => ({
        label: `${count} ${plural(count, locale, ['реплика', 'реплики', 'реплик'], ['line', 'lines'])}`,
        onSelect: () => {
          autoplay(count)
          scrollToNewest()
        },
      }))
    )
  }

  const confirmDelete = () => {
    confirmDeleteChat(async () => {
      discard()
      await deleteChat(db, chatId)
      router.back()
    })
  }

  const suggestName = async () => {
    try {
      if (!(await autoName())) showMessage(t('chat.titleNotFoundTitle'), t('chat.titleNotFoundMessage'))
    } catch (err) {
      showMessage(t('chat.titleFailedTitle'), errorMessage(err))
    }
  }

  // The cast in the header is the menu's trigger, so their photos open from the menu.
  const gallery = castGallery(members.map((m) => m.character))
  const roomMenu: MenuItem[] = [
    ...(gallery.length ? [{ label: t('room.menuShowAvatars'), systemImage: 'photo.on.rectangle', onSelect: () => openViewer(gallery) }] : []),
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: () => promptRenameChat(title, rename) },
    { label: t('chat.menuSuggestTitle'), systemImage: 'sparkles', onSelect: suggestName },
    {
      label: t('room.menuFloor', { mode: t(`room.floor.${floor}`) }),
      systemImage: 'person.wave.2',
      onSelect: chooseFloor,
    },
    { label: t('room.menuAutoplay'), systemImage: 'bubble.left.and.bubble.right', onSelect: chooseAutoplay },
    { label: t('room.menuEditRoom'), systemImage: 'slider.horizontal.3', onSelect: () => router.push(`/room/${room.id}`) },
    { label: t('chat.menuDeleteChat'), systemImage: 'trash', destructive: true, onSelect: confirmDelete },
  ]

  const editing = useMemo(() => (editingRow ? { id: editingRow.id, text: editingRow.content } : null), [editingRow])

  const placeholder = narration
    ? t('room.placeholderNarration')
    : !addressees.length
      ? t('room.placeholderEveryone')
      : whisper
        ? t('room.placeholderWhisper', { names: addressees.map(nameOf).join(', ') })
        : t('room.placeholderTo', { names: addressees.map(nameOf).join(', ') })

  const cast = useMemo(() => members.map((m) => ({ name: m.character.name, avatar: m.character.avatar })), [members])
  const empty = loaded && rows.length === 0
  const emptyStyle = useAnimatedStyle(() => ({
    paddingTop: headerHeight,
    paddingBottom: composerHeight.value + Math.max(0, Math.abs(keyboard.height.value) - insets.bottom),
  }))

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

  const status = <Status phase={phase} draftSpeaker={draft ? nameOf(draft.speakerId) : null} next={queue.map((p) => nameOf(p.characterId))} auto={auto} />

  return (
    <View style={styles.screen}>
      {room.background ? (
        <ChatBackground
          uri={avatarUri(room.background, 'backgrounds') ?? ''}
          effect={room.backgroundEffect}
          intensity={room.backgroundIntensity}
        />
      ) : null}
      <View style={StyleSheet.absoluteFill}>
        <ConversationList
          ref={listRef}
          rows={rows}
          renderRow={renderRow}
          extraData={locked}
          composerHeight={composerHeight}
          header={error ? <ErrorCard message={error} onRetry={retry} /> : null}
          footer={loaded && !empty ? <RoomIntro room={room} cast={cast} /> : null}
          onAwayChange={setAwayFromEnd}
          focusId={focusMessageId}
        />
      </View>

      {empty ? (
        <Animated.View style={[styles.empty, emptyStyle]} pointerEvents="none">
          <RoomIntro room={room} cast={cast} hint={members.length ? t('room.emptyHint') : t('room.noMembersHint')} />
        </Animated.View>
      ) : null}

      <GlassHeader
        floating
        left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} />}
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
            <Link href={`/chat/new?room=${room.id}`} asChild>
              <Link.AppleZoom>
                <GlassButton icon="create-outline" />
              </Link.AppleZoom>
            </Link>
          </View>
        }
      >
        <NativeMenu items={roomMenu} style={styles.whoPress} glassRadius={22}>
          <PillSurface style={[styles.who, liquidGlass && styles.whoPill]}>
            <AvatarStack cast={cast} size={28} viewable={false} />
            <View style={styles.whoText}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {room.name}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </View>
              {title || naming ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {title ?? t('chat.namingInProgress')}
                </Text>
              ) : null}
            </View>
          </PillSurface>
        </NativeMenu>
      </GlassHeader>

      <ComposerSwap id={asideOpen ? 'aside' : 'scene'}>
        <Composer
          height={composerHeight}
          initialText={asideOpen ? undefined : sceneDraft.current}
          onTextChange={asideOpen ? undefined : (text) => (sceneDraft.current = text)}
          autoFocus={asideOpen}
          generating={asideOpen ? aside.phase !== 'idle' : !idle}
          editing={asideOpen ? null : editing}
          placeholder={asideOpen ? t('chat.privatePlaceholder') : placeholder}
          hushed={asideOpen || (whisper && addressees.length > 0 && !narration)}
          toolbar={
            members.length && !asideOpen ? (
              <>
                <CastBar
                  members={members}
                  addressees={addressees}
                  whisper={whisper}
                  narration={narration}
                  onOpen={() => {
                    Keyboard.dismiss()
                    setCastOpen(true)
                  }}
                />
                <FloorButton floor={floor} onChange={changeFloor} />
              </>
            ) : null
          }
          accessory={
            asidePanel ?? (
              <View style={styles.accessory} pointerEvents="box-none">
                {awayFromEnd ? <JumpButton onPress={() => listRef.current?.jumpToNewest()} /> : null}
                {idle ? null : status}
              </View>
            )
          }
          onSend={(text, images) => {
            if (asideOpen) return void aside.ask(text, images)
            send(text, images, { addressees, whisper, narration })
            setWhisper(false)
            setNarration(false)
            scrollToNewest()
          }}
          onStop={asideOpen ? aside.stop : stop}
          onContinue={
            members.some((m) => m.present && !m.muted) && !asideOpen
              ? () => {
                  proceed()
                  scrollToNewest()
                }
              : undefined
          }
          onContinueLongPress={asideOpen ? undefined : chooseAutoplay}
          onSubmitEdit={async (text) => {
            if (editingRow) await editMessage(editingRow.id, text)
            setEditingRow(null)
          }}
          onCancelEdit={() => setEditingRow(null)}
        />
      </ComposerSwap>

      <CastSheet
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
      <TextSheet text={selecting} onClose={() => setSelecting(null)} />
    </View>
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
        <Text style={styles.statusText} numberOfLines={1}>
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

function RoomIntro({ room, cast, hint }: { room: Room; cast: { name: string; avatar: string | null }[]; hint?: string }) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.intro}>
      <AvatarStack cast={cast} size={56} max={4} />
      <Text style={styles.introName}>{room.name}</Text>
      {room.scenario.trim() ? (
        <Text style={styles.introScenario} numberOfLines={3}>
          {room.scenario.trim()}
        </Text>
      ) : null}
      {hint ? <Text style={styles.introMeta}>{hint}</Text> : null}
    </View>
  )
}

const PillSurface = nativeMenuGlass ? View : GlassSurface

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    whoPress: { alignSelf: 'flex-start', maxWidth: '100%' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    whoPill: { borderRadius: 22, paddingVertical: 4, paddingLeft: 6, paddingRight: 14 },
    whoText: { flexShrink: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    name: { flexShrink: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 18, fontWeight: '600' },
    subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 1 },
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
    empty: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
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
    statusSolid: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
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
