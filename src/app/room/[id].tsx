import { Icon } from '@/components/visuals/Icon'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'

import { Avatar } from '@/components/visuals/Avatar'
import { CastMosaic } from '@/components/cast/CastMosaic'
import { glowTop, hexRgb, ProfileGlow, profileTint } from '@/components/cast/ProfileGlow'
import { memberSummary, RoomProfile } from '@/components/cast/RoomProfile'
import { BarButton, DrawnFormScreenHeader, useAvatarHandOff } from '@/components/chrome/FormScreenHeader'
import { useHeaderHeight, useScreenPadding } from '@/components/chrome/GlassHeader'
import { ButtonCell, InputCell, ListFooter, ListSection, SegmentCell, SliderCell, SwitchCell, TextCell } from '@/components/lists/GroupedList'
import { BackgroundSection, BackgroundThumbCell, SourceCell } from '@/components/lists/PictureCells'
import { NativeActionRow, NativeForm, NativeHostedRow, NativeSection, NativeSegmentRow, NativeSliderRow, NativeTextRow, nativeForm } from '@/components/lists/NativeForm'
import { AddCharactersSheet } from '@/components/overlays/AddCharactersSheet'
import { insertCharacter, listCharacters, newCharacterFields, type Character, type CharacterPreview } from '@/db/characters'
import { useDatabase } from '@/db/provider'
import {
  DEFAULT_MEMBER,
  DEFAULT_ROOM,
  deleteRoom,
  getRoom,
  listRoomMembers,
  saveRoom,
  type FloorMode,
  type MemberSettings,
  type RoomFields,
} from '@/db/rooms'
import { useImageSlot } from '@/hooks/features/useImageSlot'
import { useRoomActions } from '@/hooks/features/useRoomActions'
import { useTranslation } from '@/i18n'
import { setGenDraft } from '@/lib/chat/genDraft'
import { formatSetup, parseSetup, sameName, type GenCastMember } from '@/lib/chat/room/roomGen'
import { avatarUri, pickBackground, type CropRect } from '@/lib/images/avatars'
import { setBackgroundDraft } from '@/lib/images/backgroundDraft'
import { avatarTint } from '@/lib/images/initial'
import { usePictureColor } from '@/lib/images/pictureColor'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import * as Haptics from '@/lib/ui/haptics'
import type { ImageSource } from '@/lib/images/images'
import { alertError } from '@/lib/transfer/report'
import { showToast } from '@/lib/ui/toast'
import { type Colors, HEADER_ROW_HEIGHT, useColors, useStyles, useTheme } from '@/theme'

type Member = MemberSettings & { character: Character }

const percent = (value: number) => `${Math.round(value * 100)}%`

// The profile's settings, background and export are the system's own list where the list can
// tell how tall it is (iOS 18).
const systemProfile = nativeForm !== null && Number.parseInt(String(Platform.Version), 10) >= 18

export default function RoomEditorScreen() {
  const { id, profile } = useLocalSearchParams<{ id: string; profile?: string }>()
  const isNew = id === 'new'
  // Opened as the room's profile, it is only looked at until the pencil turns it into the
  // editor, and saving turns it back, as a character's profile does.
  const asProfile = profile === '1' && !isNew
  const [editing, setEditing] = useState(!asProfile)
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const { scheme } = useTheme()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const { exportFile } = useRoomActions(() => {})

  const FLOOR_OPTIONS: { value: FloorMode; label: string }[] = [
    { value: 'addressee', label: t('room.floor.addressee') },
    { value: 'reactions', label: t('room.floor.reactions') },
    { value: 'open', label: t('room.floor.open') },
  ]

  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState<RoomFields>(DEFAULT_ROOM)
  const [members, setMembers] = useState<Member[]>([])
  const [characters, setCharacters] = useState<CharacterPreview[]>([])
  const [picking, setPicking] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  // Characters the setup brought in that do not exist yet go in under ids below zero, and
  // are made when the room is saved.
  const nextNewId = useRef(-1)
  // What the texts, or the whole room, were before the last AI result replaced them, until
  // it is put back.
  const [beforeScenario, setBeforeScenario] = useState<string | null>(null)
  const [beforeOpening, setBeforeOpening] = useState<string | null>(null)
  const [beforeSetup, setBeforeSetup] = useState<{ fields: RoomFields; members: Member[] } | null>(null)
  const bgSlot = useImageSlot('backgrounds')

  const set = <K extends keyof RoomFields>(key: K, value: RoomFields[K]) => setFields((f) => ({ ...f, [key]: value }))

  useEffect(() => {
    ;(async () => {
      setCharacters(await listCharacters(db))
      if (isNew) return setReady(true)
      const room = await getRoom(db, Number(id))
      if (!room) return router.back()
      const { id: _id, createdAt: _createdAt, ...rest } = room
      setFields(rest)
      setMembers(await listRoomMembers(db, room.id))
      bgSlot.remember({ file: room.background, original: room.backgroundOriginal })
      setReady(true)
    })()
  }, [db, id, isNew, router])

  const defaultName = () => {
    const names = members.map((m) => m.character.name)
    if (names.length <= 1) return names.join('')
    return `${names.slice(0, -1).join(', ')} ${t('room.and')} ${names[names.length - 1]}`
  }

  const canSave = ready && !saving && members.length > 0

  const updateMember = (characterId: number, patch: Partial<MemberSettings>) =>
    setMembers((list) => list.map((m) => (m.characterId === characterId ? { ...m, ...patch } : m)))

  // Those kept keep their place and settings; the newly picked come after them in the order
  // they were ticked.
  const pickMembers = (ids: number[]) => {
    setPicking(false)
    setMembers((list) => {
      // Characters not made yet are not in the sheet's list, so the picking leaves them be.
      const kept = list.filter((m) => ids.includes(m.characterId) || m.characterId < 0)
      const added = ids.flatMap((characterId) => {
        if (list.some((m) => m.characterId === characterId)) return []
        const character = characters.find((c) => c.id === characterId)
        return character ? [{ ...DEFAULT_MEMBER, characterId, character }] : []
      })
      return [...kept, ...added]
    })
  }

  const backgroundValue = { file: fields.background, original: fields.backgroundOriginal, crop: fields.backgroundCrop }
  const backgroundUri = bgSlot.shown(fields.background)

  // `original` is what gets stored beside the framed copy: a temporary file for a fresh
  // pick, or null when the stored original is reframed.
  const openBackground = (uri: string, crop: CropRect | null, original: string | null) => {
    setBackgroundDraft({
      uri,
      crop,
      characterName: fields.name.trim() || defaultName(),
      effect: fields.backgroundEffect,
      intensity: fields.backgroundIntensity,
      bubbleTransparency: fields.backgroundBubbleTransparency,
      tone: fields.backgroundTone,
      onDone: (result) => {
        bgSlot.setFramed(result.uri, result.crop, original)
        setFields((f) => ({
          ...f,
          backgroundOriginal: original ? null : f.backgroundOriginal,
          backgroundEffect: result.effect,
          backgroundIntensity: result.intensity,
          backgroundBubbleTransparency: result.bubbleTransparency,
          backgroundTone: result.tone,
        }))
      },
    })
    router.push('/background')
  }

  const onPickBackground = async (source: ImageSource) => {
    try {
      const uri = await pickBackground(source)
      if (uri) openBackground(uri, null, uri)
    } catch (err) {
      alertError(t('background.failedTitle'), err)
    }
  }

  const onAdjustBackground = () => {
    const source = bgSlot.adjustSource(backgroundValue)
    if (source) openBackground(source.uri, source.crop, source.original)
  }

  const onClearBackground = () => {
    bgSlot.clearPicked()
    setFields((f) => ({ ...f, background: null, backgroundOriginal: null, backgroundCrop: null }))
  }

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const nextBackground = await bgSlot.persist(backgroundValue)
      const { file: background, original: backgroundOriginal, crop: backgroundCrop } = nextBackground
      const name = fields.name.trim() || defaultName()
      const saved: Member[] = []
      for (const m of members) {
        if (m.characterId >= 0) {
          saved.push(m)
          continue
        }
        const characterId = await insertCharacter(db, m.character)
        saved.push({ ...m, characterId, character: { ...m.character, id: characterId } })
      }
      const roomId = await saveRoom(db, isNew ? null : Number(id), { ...fields, name, background, backgroundOriginal, backgroundCrop }, saved)
      setMembers(saved)
      bgSlot.settle(nextBackground)
      if (isNew) return router.replace(`/chat/latest?room=${roomId}`)
      if (!asProfile) return router.back()
      // Back to the profile, now showing what was saved.
      setFields((f) => ({ ...f, name, background, backgroundOriginal, backgroundCrop }))
      setExpanded(null)
      setSaving(false)
      setEditing(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      setSaving(false)
      alertError(t('editor.saveFailedTitle'), err)
    }
  }

  // The generators open as a form sheet of the stack, app/generate.tsx, and see the cast by
  // the head of each member's prompt.
  const genCast: GenCastMember[] = members.map((m) => ({ name: m.character.name, prompt: m.character.systemPrompt }))
  const canSetUp = members.length > 0 || characters.length > 0
  // The opening is written from the scene or at least from who is in it.
  const canOpen = members.length > 0 || fields.scenario.trim().length > 0

  const openScenarioGen = () => {
    setGenDraft({ kind: 'scenario', target: `room:${id}`, cast: genCast, currentScenario: fields.scenario, onApply: applyScenario })
    router.push('/generate')
  }

  const openOpeningGen = () => {
    setGenDraft({ kind: 'opening', target: `room:${id}`, cast: genCast, scenario: fields.scenario, currentOpening: fields.opening, onApply: applyOpening })
    router.push('/generate')
  }

  // The room as a setup sheet, to be improved and compared with; a room with nothing written
  // and nobody tuned yet has nothing to improve.
  const openSetupGen = () => {
    const tuned =
      fields.scenario.trim() || fields.opening.trim() || members.some((m) => m.triggers.trim() || m.bonds.trim() || m.secret.trim())
    const currentSetup = tuned
      ? formatSetup(
          { ...fields, name: fields.name.trim() || defaultName() },
          members.map((m) => ({ name: m.character.name, settings: m, prompt: m.characterId < 0 ? m.character.systemPrompt : undefined })),
          locale
        )
      : ''
    const library = characters
      .filter((c) => !members.some((m) => m.characterId === c.id))
      .map((c) => ({ name: c.name, prompt: c.systemPrompt }))
    setGenDraft({ kind: 'room', target: `room:${id}`, cast: genCast, library, currentSetup, onApply: applySetup })
    router.push('/generate')
  }

  const applyScenario = (text: string) => {
    setBeforeScenario(fields.scenario)
    set('scenario', text)
  }

  const applyOpening = (text: string) => {
    setBeforeOpening(fields.opening)
    set('opening', text)
  }

  // The sheet read back: the room's fields, and each member's numbers by name. A character of
  // the user's list the sheet names joins the room after those already in it.
  const applySetup = (text: string) => {
    const setup = parseSetup(text)
    const next = [...members]
    let matched = 0
    for (const { name, prompt, ...settings } of setup.members) {
      const at = next.findIndex((m) => sameName(m.character.name, name))
      if (at >= 0) {
        // A character not made yet takes the prompt as it was rewritten.
        const character = next[at].characterId < 0 && prompt ? { ...next[at].character, systemPrompt: prompt } : next[at].character
        next[at] = { ...next[at], ...settings, character }
        matched += 1
        continue
      }
      const known = characters.find((c) => sameName(c.name, name))
      if (known) {
        next.push({ ...DEFAULT_MEMBER, ...settings, characterId: known.id, character: known })
        matched += 1
        continue
      }
      // Someone the user named who is nowhere in the list is made from the prompt the sheet
      // wrote for them.
      if (!prompt) continue
      const characterId = nextNewId.current--
      next.push({
        ...DEFAULT_MEMBER,
        ...settings,
        characterId,
        character: { ...newCharacterFields(name, prompt), id: characterId, createdAt: Date.now() },
      })
      matched += 1
    }
    if (!matched && !Object.keys(setup.fields).length) {
      showToast({ tone: 'error', title: t('roomGen.parseFailed'), message: t('roomGen.parseFailedText') })
      return
    }
    setBeforeSetup({ fields, members })
    setFields((f) => ({ ...f, ...setup.fields }))
    setMembers(next)
    setExpanded(null)
  }

  const undoScenario = () => {
    if (beforeScenario === null) return
    set('scenario', beforeScenario)
    setBeforeScenario(null)
  }

  const undoOpening = () => {
    if (beforeOpening === null) return
    set('opening', beforeOpening)
    setBeforeOpening(null)
  }

  const undoSetup = () => {
    if (!beforeSetup) return
    setFields(beforeSetup.fields)
    setMembers(beforeSetup.members)
    setBeforeSetup(null)
  }

  const confirmDelete = () => {
    confirmDeletion({
      title: t('roomEditor.deleteConfirmTitle'),
      message: t('roomEditor.deleteConfirmMessage'),
      onConfirm: async () => {
        await deleteRoom(db, Number(id))
        bgSlot.removeStored()
        router.dismissTo('/rooms')
      },
    })
  }

  // The room's own name heads the screen once it has one, as a character's does.
  const title = fields.name.trim() || defaultName() || (isNew ? t('roomEditor.newTitle') : t('roomEditor.title'))
  // While a member is open, its notes stand under the group rather than beside each row.
  const memberOpen = members.some((m) => m.characterId === expanded)
  const cast = members.map((m) => ({ name: m.character.name, avatar: m.character.avatar }))

  // The profile is washed in the color of its first photo, or of the first member's initial,
  // as a character's is in its avatar's.
  const face = members.find((m) => m.character.avatar)?.character.avatar ?? null
  const faceColor = usePictureColor(editing || !face ? null : avatarUri(face))
  const average = editing ? null : face ? faceColor : hexRgb(avatarTint(members[0]?.character.name ?? title))
  const glowColor = average ? profileTint(average) : null

  const scrollY = useSharedValue(0)
  // The cast does not spread out over the page as a photo does: only the hand-off into the
  // header on a scroll is the profile's.
  const still = useSharedValue(0)
  const handOff = useAvatarHandOff(still, scrollY)
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y
  })
  // The system's list and the profile's scroll view take turns, and each comes up at its top:
  // what the header follows of the scroll starts there again.
  useEffect(() => {
    if (nativeForm) scrollY.value = 0
  }, [editing, scrollY])
  const contentPadding = editing ? padding : { ...padding, paddingTop: padding.paddingTop + PROFILE_TOP_GAP }
  const sideLeft = padding.paddingLeft ?? padding.paddingHorizontal
  const sideRight = padding.paddingRight ?? padding.paddingHorizontal
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const headerHeight = useHeaderHeight()
  const castCenterY = contentPadding.paddingTop + CAST_SIZE / 2
  const headerAvatar = editing
    ? undefined
    : {
        node: <CastMosaic cast={cast} name={title} size={CAST_SIZE} round />,
        size: CAST_SIZE,
        centerX: sideLeft + (screenWidth - sideLeft - sideRight) / 2,
        centerY: castCenterY,
      }
  // A short profile would stop scrolling before the cast reaches the star and leave it
  // halfway, so the page always has room for the whole way up.
  const scrollRoom = editing
    ? contentPadding
    : { ...contentPadding, minHeight: screenHeight + castCenterY - (headerHeight - HEADER_ROW_HEIGHT / 2) }

  const profileBackground = backgroundUri
    ? { uri: backgroundUri, crop: bgSlot.shownCrop(fields.backgroundCrop), effect: fields.backgroundEffect, intensity: fields.backgroundIntensity }
    : null

  // A member's row, which opens its settings under it.
  const memberHead = (member: Member, index: number, open: boolean) => (
    <Pressable
      onPress={() => setExpanded(open ? null : member.characterId)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      // No highlight in the system's list, where only its own rows light up under the touch.
      style={({ pressed }) => [styles.memberHead, pressed && !nativeForm && styles.pressed]}
    >
      <Avatar name={member.character.name} file={member.character.avatar} size={36} />
      <View style={styles.memberBody}>
        <Text style={[styles.memberName, { color: colors.cast[index % colors.cast.length] }]} numberOfLines={1}>
          {member.character.name}
        </Text>
        <Text style={styles.memberMeta} numberOfLines={1}>
          {member.characterId < 0 ? t('roomEditor.newCharacter') : memberSummary(member, t)}
        </Text>
      </View>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
    </Pressable>
  )

  // The long texts as previews that open the editor over the whole screen.
  const scenarioText = (
    <TextCell
      title={t('roomEditor.scenario')}
      value={fields.scenario}
      placeholder={t('roomEditor.scenarioPlaceholder')}
      onChangeText={(v) => set('scenario', v)}
      lines={6}
    />
  )
  const openingText = (
    <TextCell
      title={t('roomEditor.opening')}
      value={fields.opening}
      placeholder={t('roomEditor.openingPlaceholder')}
      onChangeText={(v) => set('opening', v)}
    />
  )

  // What a member feels about the others and what only they know, as previews that open the
  // editor over the whole screen.
  const bondsText = (member: Member) => (
    <TextCell
      title={t('roomEditor.bonds')}
      value={member.bonds}
      placeholder={t('roomEditor.bondsPlaceholder')}
      onChangeText={(v) => updateMember(member.characterId, { bonds: v })}
      lines={2}
    />
  )
  const secretText = (member: Member) => (
    <TextCell
      title={t('roomEditor.secret')}
      value={member.secret}
      placeholder={t('roomEditor.secretPlaceholder')}
      onChangeText={(v) => updateMember(member.characterId, { secret: v })}
      lines={2}
    />
  )

  // The editor as the system's own list (iOS with SwiftUI), put in place of the profile's
  // scroll view while editing. The cast, the members' rows, the long texts' previews, the
  // background's thumbnail and the button that brings up its sources stay React Native views
  // in rows of their own: a member's name keeps its color, which a button of the list
  // would paint over.
  const renderNative = ({ ui }: NonNullable<typeof nativeForm>) => (
    <NativeForm>
      <NativeSection inset={HEADER_ROW_HEIGHT}>
        <NativeHostedRow clear>
          <View style={styles.castFlush}>
            <CastMosaic cast={cast} name={title} size={CAST_SIZE} round viewable />
          </View>
        </NativeHostedRow>
      </NativeSection>

      <NativeSection>
        <NativeTextRow
          label={t('roomEditor.nameLabel')}
          value={fields.name}
          onChangeText={(v) => set('name', v)}
          placeholder={defaultName() || t('roomEditor.namePlaceholder')}
        />
      </NativeSection>

      <NativeSection footer={t('roomEditor.autoSetupHint')}>
        <NativeActionRow label={t('roomEditor.autoSetup')} onPress={openSetupGen} disabled={!canSetUp} />
        {beforeSetup ? <NativeActionRow label={t('roomEditor.undoSetup')} onPress={undoSetup} /> : null}
      </NativeSection>

      <NativeSection
        title={t('roomEditor.membersSection')}
        footer={
          memberOpen
            ? [
                { text: t('roomEditor.perceptionHint') },
                { text: t('roomEditor.triggersHint') },
                { text: t('roomEditor.bondsHint') },
                { text: t('roomEditor.secretHint') },
                { text: t('roomEditor.presentNote') },
                { text: t('roomEditor.mutedNote') },
              ]
            : members.length
              ? undefined
              : t('roomEditor.noMembers')
        }
      >
        {members.map((member, index) => {
          const open = expanded === member.characterId
          return (
            <Fragment key={member.characterId}>
              {/* A new view whenever a member opens or closes: the list remakes the rows below
                  the ones it adds or takes away, and a view hosted in one of them goes away
                  with the row it was in, leaving the new one blank. */}
              <NativeHostedRow key={`${expanded}`}>{memberHead(member, index, open)}</NativeHostedRow>
              {open ? (
                <>
                  <NativeSliderRow
                    label={t('roomEditor.talkativeness')}
                    value={member.talkativeness}
                    min={0}
                    max={1}
                    step={0.05}
                    format={percent}
                    onChange={(v) => updateMember(member.characterId, { talkativeness: Math.round(v * 100) / 100 })}
                  />
                  <NativeSliderRow
                    label={t('roomEditor.perception')}
                    value={member.perception}
                    min={0}
                    max={1}
                    step={0.05}
                    format={percent}
                    onChange={(v) => updateMember(member.characterId, { perception: Math.round(v * 100) / 100 })}
                  />
                  <NativeTextRow
                    label={t('roomEditor.triggers')}
                    value={member.triggers}
                    onChangeText={(v) => updateMember(member.characterId, { triggers: v })}
                    placeholder={t('roomEditor.triggersPlaceholder')}
                  />
                  <NativeHostedRow key={`bonds${expanded}`}>{bondsText(member)}</NativeHostedRow>
                  <NativeHostedRow key={`secret${expanded}`}>{secretText(member)}</NativeHostedRow>
                  <ui.Toggle
                    label={t('roomEditor.present')}
                    isOn={member.present}
                    onIsOnChange={(v) => updateMember(member.characterId, { present: v })}
                  />
                  <ui.Toggle label={t('roomEditor.muted')} isOn={member.muted} onIsOnChange={(v) => updateMember(member.characterId, { muted: v })} />
                  <NativeActionRow
                    label={t('roomEditor.removeMember')}
                    destructive
                    onPress={() => setMembers((list) => list.filter((m) => m.characterId !== member.characterId))}
                  />
                </>
              ) : null}
            </Fragment>
          )
        })}
        <NativeActionRow label={t('roomEditor.addMembers')} onPress={() => setPicking(true)} />
      </NativeSection>

      <NativeSection
        title={t('roomEditor.floorSection')}
        footer={[
          { text: t(`room.floorHint.${fields.floor}`) },
          { text: t('roomEditor.maxChainHint') },
          { text: t('roomEditor.directorNote') },
          ...(fields.director ? [{ text: t('roomEditor.plotHint') }] : []),
        ]}
      >
        <NativeSegmentRow label={t('roomEditor.floorMode')} options={FLOOR_OPTIONS} value={fields.floor} onChange={(v) => set('floor', v)} />
        <NativeSliderRow label={t('roomEditor.maxChain')} value={fields.maxChain} min={1} max={5} step={1} onChange={(v) => set('maxChain', Math.round(v))} />
        <ui.Toggle label={t('roomEditor.director')} isOn={fields.director} onIsOnChange={(v) => set('director', v)} />
        {/* The narrator's events come from the director, so they go with it. */}
        {fields.director ? (
          <NativeSliderRow
            label={t('roomEditor.plot')}
            value={fields.plot}
            min={0}
            max={1}
            step={0.1}
            format={percent}
            onChange={(v) => set('plot', Math.round(v * 10) / 10)}
          />
        ) : null}
      </NativeSection>

      <NativeSection title={t('roomEditor.scenario')} footer={t('roomEditor.scenarioHint')}>
        <NativeHostedRow>{scenarioText}</NativeHostedRow>
        <NativeActionRow label={fields.scenario.trim() ? t('editor.improveWithAi') : t('editor.generateWithAi')} onPress={openScenarioGen} />
        {beforeScenario !== null ? <NativeActionRow label={t('editor.undoGenerated')} onPress={undoScenario} /> : null}
      </NativeSection>

      <NativeSection title={t('roomEditor.opening')} footer={t('roomEditor.openingHint')}>
        <NativeHostedRow>{openingText}</NativeHostedRow>
        <NativeActionRow label={t('roomEditor.generateOpening')} onPress={openOpeningGen} disabled={!canOpen} />
        {beforeOpening !== null ? <NativeActionRow label={t('editor.undoGenerated')} onPress={undoOpening} /> : null}
      </NativeSection>

      <NativeSection footer={t('roomEditor.userNameHint')}>
        <NativeTextRow
          label={t('roomEditor.userName')}
          value={fields.userName}
          onChangeText={(v) => set('userName', v)}
          placeholder={t('roomEditor.userNamePlaceholder')}
          capitalize="words"
        />
      </NativeSection>

      <NativeSection title={t('background.title')}>
        {backgroundUri ? (
          <NativeHostedRow>
            <BackgroundThumbCell
              uri={backgroundUri}
              crop={bgSlot.shownCrop(fields.backgroundCrop)}
              effect={fields.backgroundEffect}
              intensity={fields.backgroundIntensity}
            />
          </NativeHostedRow>
        ) : null}
        {/* A new view once the thumbnail comes or goes above it, as with the members. */}
        <NativeHostedRow key={backgroundUri ? 'under' : 'alone'}>
          <SourceCell label={backgroundUri ? t('background.change') : t('background.choose')} onPick={onPickBackground} />
        </NativeHostedRow>
        {backgroundUri ? <NativeActionRow label={t('background.adjust')} onPress={onAdjustBackground} /> : null}
        {backgroundUri ? <NativeActionRow label={t('background.remove')} destructive onPress={onClearBackground} /> : null}
      </NativeSection>

      {!isNew ? (
        <NativeSection>
          <NativeActionRow label={t('roomEditor.deleteRoom')} destructive onPress={confirmDelete} />
        </NativeSection>
      ) : null}
    </NativeForm>
  )

  return (
    <View style={styles.screen}>
      {ready ? <ProfileGlow color={glowColor} height={screenHeight + GLOW_BELOW} scrollY={scrollY} spread={still} /> : null}
      {ready && editing && nativeForm ? (
        renderNative(nativeForm)
      ) : ready ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={scrollRoom}
          onScroll={onScroll}
        >
          <Animated.View style={[styles.castBlock, editing ? null : handOff]}>
            <CastMosaic cast={cast} name={title} size={CAST_SIZE} round viewable />
          </Animated.View>
          {editing ? (
            <>
              <ListSection>
                <InputCell
                  label={t('roomEditor.nameLabel')}
                  value={fields.name}
                  onChangeText={(v) => set('name', v)}
                  placeholder={defaultName() || t('roomEditor.namePlaceholder')}
                  autoCapitalize="sentences"
                />
              </ListSection>

              <ListSection footer={t('roomEditor.autoSetupHint')}>
                <ButtonCell label={t('roomEditor.autoSetup')} onPress={openSetupGen} disabled={!canSetUp} />
                {beforeSetup ? <ButtonCell label={t('roomEditor.undoSetup')} onPress={undoSetup} /> : null}
              </ListSection>

              <ListSection
                header={t('roomEditor.membersSection')}
                footer={
                  memberOpen ? (
                    <>
                      <ListFooter>{t('roomEditor.perceptionHint')}</ListFooter>
                      <ListFooter>{t('roomEditor.triggersHint')}</ListFooter>
                      <ListFooter>{t('roomEditor.bondsHint')}</ListFooter>
                      <ListFooter>{t('roomEditor.secretHint')}</ListFooter>
                      <ListFooter>{t('roomEditor.presentNote')}</ListFooter>
                      <ListFooter>{t('roomEditor.mutedNote')}</ListFooter>
                    </>
                  ) : members.length ? undefined : (
                    t('roomEditor.noMembers')
                  )
                }
              >
                {members.map((member, index) => {
                  const open = expanded === member.characterId
                  // An open member's own rows follow it in the group.
                  return (
                    <Fragment key={member.characterId}>
                      {memberHead(member, index, open)}
                      {open ? (
                        <>
                          <SliderCell
                            label={t('roomEditor.talkativeness')}
                            value={member.talkativeness}
                            min={0}
                            max={1}
                            step={0.05}
                            formatValue={percent}
                            onChange={(v) => updateMember(member.characterId, { talkativeness: Math.round(v * 100) / 100 })}
                          />
                          <SliderCell
                            label={t('roomEditor.perception')}
                            value={member.perception}
                            min={0}
                            max={1}
                            step={0.05}
                            formatValue={percent}
                            onChange={(v) => updateMember(member.characterId, { perception: Math.round(v * 100) / 100 })}
                          />
                          <InputCell
                            label={t('roomEditor.triggers')}
                            value={member.triggers}
                            onChangeText={(v) => updateMember(member.characterId, { triggers: v })}
                            placeholder={t('roomEditor.triggersPlaceholder')}
                          />
                          {bondsText(member)}
                          {secretText(member)}
                          <SwitchCell
                            label={t('roomEditor.present')}
                            value={member.present}
                            onValueChange={(v) => updateMember(member.characterId, { present: v })}
                          />
                          <SwitchCell
                            label={t('roomEditor.muted')}
                            value={member.muted}
                            onValueChange={(v) => updateMember(member.characterId, { muted: v })}
                          />
                          <ButtonCell
                            danger
                            label={t('roomEditor.removeMember')}
                            onPress={() => setMembers((list) => list.filter((m) => m.characterId !== member.characterId))}
                          />
                        </>
                      ) : null}
                    </Fragment>
                  )
                })}
                <ButtonCell label={t('roomEditor.addMembers')} onPress={() => setPicking(true)} />
              </ListSection>

              <ListSection
                header={t('roomEditor.floorSection')}
                footer={
                  <>
                    <ListFooter>{t(`room.floorHint.${fields.floor}`)}</ListFooter>
                    <ListFooter>{t('roomEditor.maxChainHint')}</ListFooter>
                    <ListFooter>{t('roomEditor.directorNote')}</ListFooter>
                    {fields.director ? <ListFooter>{t('roomEditor.plotHint')}</ListFooter> : null}
                  </>
                }
              >
                <SegmentCell label={t('roomEditor.floorMode')} options={FLOOR_OPTIONS} value={fields.floor} onChange={(v) => set('floor', v)} />
                <SliderCell label={t('roomEditor.maxChain')} value={fields.maxChain} min={1} max={5} step={1} onChange={(v) => set('maxChain', v)} />
                <SwitchCell label={t('roomEditor.director')} value={fields.director} onValueChange={(v) => set('director', v)} />
                {fields.director ? (
                  <SliderCell
                    label={t('roomEditor.plot')}
                    value={fields.plot}
                    min={0}
                    max={1}
                    step={0.1}
                    formatValue={percent}
                    onChange={(v) => set('plot', Math.round(v * 10) / 10)}
                  />
                ) : null}
              </ListSection>

              <ListSection header={t('roomEditor.scenario')} footer={t('roomEditor.scenarioHint')}>
                {scenarioText}
                <ButtonCell label={fields.scenario.trim() ? t('editor.improveWithAi') : t('editor.generateWithAi')} onPress={openScenarioGen} />
                {beforeScenario !== null ? <ButtonCell label={t('editor.undoGenerated')} onPress={undoScenario} /> : null}
              </ListSection>

              <ListSection header={t('roomEditor.opening')} footer={t('roomEditor.openingHint')}>
                {openingText}
                <ButtonCell label={t('roomEditor.generateOpening')} onPress={openOpeningGen} disabled={!canOpen} />
                {beforeOpening !== null ? <ButtonCell label={t('editor.undoGenerated')} onPress={undoOpening} /> : null}
              </ListSection>

              <ListSection footer={t('roomEditor.userNameHint')}>
                <InputCell
                  label={t('roomEditor.userName')}
                  value={fields.userName}
                  onChangeText={(v) => set('userName', v)}
                  placeholder={t('roomEditor.userNamePlaceholder')}
                  autoCapitalize="words"
                />
              </ListSection>

              <BackgroundSection
                uri={backgroundUri}
                crop={bgSlot.shownCrop(fields.backgroundCrop)}
                effect={fields.backgroundEffect}
                intensity={fields.backgroundIntensity}
                onPick={onPickBackground}
                onAdjust={onAdjustBackground}
                onClear={onClearBackground}
              />

              {!isNew ? (
                <ListSection>
                  <ButtonCell danger label={t('roomEditor.deleteRoom')} onPress={confirmDelete} />
                </ListSection>
              ) : null}
            </>
          ) : (
            <RoomProfile
              fields={fields}
              members={members}
              background={profileBackground}
              // Saves the room as it is stored, so edits not yet saved are not in it.
              exportItems={[
                {
                  label: t('card.saveToFiles'),
                  systemImage: 'folder',
                  onSelect: () => exportFile({ id: Number(id), name: title, background: fields.background, backgroundOriginal: fields.backgroundOriginal }),
                },
              ]}
              system={systemProfile}
              ink={glowColor ? `#${glowColor.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}` : undefined}
              // The system's list keeps margins of its own, so it is taken out to the edges.
              systemStyle={{ marginLeft: -sideLeft, marginRight: -sideRight }}
            />
          )}
        </KeyboardAwareScrollView>
      ) : null}

      <AddCharactersSheet
        visible={picking}
        characters={characters}
        initial={members.map((m) => m.characterId)}
        title={t('roomEditor.pickTitle')}
        confirmLabel={t('roomEditor.done')}
        onConfirm={pickMembers}
        onClose={() => setPicking(false)}
      />

      {/* Opened with a zoom from the list of rooms, so the header is drawn here rather than
          by the native bar; see DrawnFormScreenHeader. */}
      <DrawnFormScreenHeader
        title={title}
        overPhoto={still}
        scrollY={scrollY}
        avatar={headerAvatar}
        clearAtTop={!editing}
        fadeRgb={glowColor ? glowTop(glowColor, colors.bgRgb, scheme) : undefined}
        right={
          // One button that turns from the pencil into the checkmark, so the change is the
          // symbol's own transition rather than a swap.
          <BarButton
            symbol={editing ? 'checkmark' : 'pencil'}
            fallback={editing ? 'checkmark' : 'pencil'}
            disabled={editing ? !canSave : !ready}
            onPress={editing ? onSave : () => setEditing(true)}
            accessibilityLabel={editing ? t('common.save') : t('action.edit')}
            prominent={editing}
            animateChange
          />
        }
      />
    </View>
  )
}

const PROFILE_TOP_GAP = 14
const CAST_SIZE = 96
// How far past the bottom of the screen the profile's glow runs out.
const GLOW_BELOW = 120

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    castBlock: { alignItems: 'center', marginBottom: 24 },
    castFlush: { alignItems: 'center' },
    pressed: { backgroundColor: colors.surfaceRaised },
    memberHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    memberBody: { flex: 1 },
    memberName: { fontSize: 17, fontWeight: '600' },
    memberMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  })
