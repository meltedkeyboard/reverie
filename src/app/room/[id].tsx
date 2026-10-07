import { Icon } from '@/components/visuals/Icon'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Fragment, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { Avatar } from '@/components/visuals/Avatar'
import { Segmented } from '@/components/controls/Segmented'
import { BarButton, DrawnFormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useScreenPadding } from '@/components/chrome/GlassHeader'
import { ButtonCell, InputCell, ListFooter, ListSection, SliderCell, SwitchCell, TextCell } from '@/components/lists/GroupedList'
import { BackgroundSection } from '@/components/lists/PictureCells'
import { PageSheet } from '@/components/overlays/PageSheet'
import { listCharacters, type Character, type CharacterPreview } from '@/db/characters'
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
import { useTranslation } from '@/i18n'
import { pickBackground, type CropRect } from '@/lib/images/avatars'
import { setBackgroundDraft } from '@/lib/images/backgroundDraft'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import * as Haptics from '@/lib/ui/haptics'
import type { ImageSource } from '@/lib/images/images'
import { alertError } from '@/lib/transfer/report'
import { type Colors, useColors, useStyles } from '@/theme'

type Member = MemberSettings & { character: Character }

const percent = (value: number) => `${Math.round(value * 100)}%`

export default function RoomEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()

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

  const toggleCharacter = (character: Character) => {
    Haptics.selectionAsync()
    setMembers((list) =>
      list.some((m) => m.characterId === character.id)
        ? list.filter((m) => m.characterId !== character.id)
        : [...list, { ...DEFAULT_MEMBER, characterId: character.id, character }]
    )
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
      onDone: (result) => {
        bgSlot.setFramed(result.uri, result.crop, original)
        setFields((f) => ({
          ...f,
          backgroundOriginal: original ? null : f.backgroundOriginal,
          backgroundEffect: result.effect,
          backgroundIntensity: result.intensity,
          backgroundBubbleTransparency: result.bubbleTransparency,
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
      const roomId = await saveRoom(
        db,
        isNew ? null : Number(id),
        { ...fields, name: fields.name.trim() || defaultName(), background, backgroundOriginal, backgroundCrop },
        members
      )
      bgSlot.settle(nextBackground)
      if (isNew) router.replace(`/rooms/${roomId}`)
      else router.back()
    } catch (err) {
      setSaving(false)
      alertError(t('editor.saveFailedTitle'), err)
    }
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

  const title = isNew ? t('roomEditor.newTitle') : t('roomEditor.title')
  // While a member is open, its notes stand under the group rather than beside each row.
  const memberOpen = members.some((m) => m.characterId === expanded)

  return (
    <View style={styles.screen}>
      {ready ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
        >
          <ListSection>
            <InputCell
              label={t('roomEditor.nameLabel')}
              value={fields.name}
              onChangeText={(v) => set('name', v)}
              placeholder={defaultName() || t('roomEditor.namePlaceholder')}
              autoCapitalize="sentences"
            />
          </ListSection>

          <ListSection
            header={t('roomEditor.membersSection')}
            footer={
              memberOpen ? (
                <>
                  <ListFooter>{t('roomEditor.perceptionHint')}</ListFooter>
                  <ListFooter>{t('roomEditor.triggersHint')}</ListFooter>
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
                  <Pressable
                    onPress={() => setExpanded(open ? null : member.characterId)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    style={({ pressed }) => [styles.memberHead, pressed && styles.pressed]}
                  >
                    <Avatar name={member.character.name} file={member.character.avatar} size={36} />
                    <View style={styles.memberBody}>
                      <Text style={[styles.memberName, { color: colors.cast[index % colors.cast.length] }]} numberOfLines={1}>
                        {member.character.name}
                      </Text>
                      <Text style={styles.memberMeta} numberOfLines={1}>
                        {!member.present
                          ? t('roomEditor.outOfScene')
                          : member.muted
                            ? t('roomEditor.listensOnly')
                            : t('roomEditor.memberSummary', {
                                talk: percent(member.talkativeness),
                                ear: percent(member.perception),
                              })}
                      </Text>
                    </View>
                    <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
                  </Pressable>
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
              </>
            }
          >
            <View style={styles.segmentRow}>
              <Segmented options={FLOOR_OPTIONS} value={fields.floor} onChange={(v) => set('floor', v)} />
            </View>
            <SliderCell label={t('roomEditor.maxChain')} value={fields.maxChain} min={1} max={5} step={1} onChange={(v) => set('maxChain', v)} />
            <SwitchCell label={t('roomEditor.director')} value={fields.director} onValueChange={(v) => set('director', v)} />
          </ListSection>

          <ListSection header={t('roomEditor.scenario')} footer={t('roomEditor.scenarioHint')}>
            <TextCell
              title={t('roomEditor.scenario')}
              value={fields.scenario}
              placeholder={t('roomEditor.scenarioPlaceholder')}
              onChangeText={(v) => set('scenario', v)}
              lines={6}
            />
          </ListSection>

          <ListSection header={t('roomEditor.opening')} footer={t('roomEditor.openingHint')}>
            <TextCell
              title={t('roomEditor.opening')}
              value={fields.opening}
              placeholder={t('roomEditor.openingPlaceholder')}
              onChangeText={(v) => set('opening', v)}
            />
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
        </KeyboardAwareScrollView>
      ) : null}

      <PageSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t('roomEditor.pickTitle')}
        background={colors.bg}
        right={
          <Pressable onPress={() => setPicking(false)} hitSlop={8}>
            <Text style={styles.done}>{t('roomEditor.done')}</Text>
          </Pressable>
        }
      >
        <ScrollView contentContainerStyle={styles.pickList}>
          <ListSection footer={characters.length ? undefined : t('roomEditor.noCharacters')}>
            {characters.map((character) => {
              const on = members.some((m) => m.characterId === character.id)
              return (
                <Pressable
                  key={character.id}
                  onPress={() => toggleCharacter(character)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
                >
                  <Avatar name={character.name} file={character.avatar} size={36} viewable={false} />
                  <Text style={styles.pickName} numberOfLines={1}>
                    {character.name}
                  </Text>
                  {on ? <Icon name="checkmark" size={22} color={colors.accent} /> : null}
                </Pressable>
              )
            })}
          </ListSection>
        </ScrollView>
      </PageSheet>

      <DrawnFormScreenHeader
        title={title}
        right={
          <BarButton
            symbol="checkmark"
            fallback="checkmark"
            disabled={!canSave}
            onPress={onSave}
            accessibilityLabel={t('common.save')}
            prominent
          />
        }
      />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    pressed: { backgroundColor: colors.surfaceRaised },
    memberHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    memberBody: { flex: 1 },
    memberName: { fontSize: 17, fontWeight: '600' },
    memberMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    segmentRow: { paddingHorizontal: 16, paddingVertical: 12 },
    done: { color: colors.accent, fontSize: 17, fontWeight: '600' },
    pickList: { padding: 16 },
    pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, minHeight: 52 },
    pickName: { flex: 1, color: colors.text, fontSize: 17 },
  })
