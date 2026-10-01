import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { Avatar } from '@/components/Avatar'
import { ChatBackground } from '@/components/ChatBackground'
import { ChipGroup } from '@/components/ChipGroup'
import { BarButton, DrawnFormScreenHeader } from '@/components/FormScreenHeader'
import { useScreenPadding } from '@/components/GlassHeader'
import { ImageSourceMenu } from '@/components/ImageSourceMenu'
import { Divider } from '@/components/motifs/Divider'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import { FieldRow } from '@/components/motifs/FieldRow'
import { PillButton } from '@/components/PillButton'
import { PageSheet } from '@/components/PageSheet'
import { ParamSlider } from '@/components/ParamSlider'
import { ToggleRow } from '@/components/ToggleRow'
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
import { useTranslation } from '@/i18n'
import { avatarUri, persistAvatar, pickBackground, removeAvatar } from '@/lib/avatars'
import { setBackgroundDraft } from '@/lib/backgroundDraft'
import { confirmDeletion } from '@/lib/confirmDelete'
import { showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import * as Haptics from '@/lib/haptics'
import type { ImageSource } from '@/lib/images'
import { useColors, useStyles, type Colors } from '@/theme'

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
  const [bgPickedUri, setBgPickedUri] = useState<string | null>(null)
  const storedBackground = useRef<string | null>(null)

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
      storedBackground.current = room.background
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

  const backgroundUri = bgPickedUri ?? (fields.background ? avatarUri(fields.background, 'backgrounds') : null)

  const openBackground = (uri: string, fresh: boolean) => {
    setBackgroundDraft({
      uri,
      characterName: fields.name.trim() || defaultName(),
      effect: fields.backgroundEffect,
      intensity: fields.backgroundIntensity,
      bubbleTransparency: fields.backgroundBubbleTransparency,
      onDone: (result) => {
        if (result.uri) setBgPickedUri(result.uri)
        else if (fresh) setBgPickedUri(uri)
        setFields((f) => ({
          ...f,
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
      if (uri) openBackground(uri, true)
    } catch (err) {
      showMessage(t('background.failedTitle'), errorMessage(err))
    }
  }

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const background = bgPickedUri ? await persistAvatar(bgPickedUri, 'backgrounds') : fields.background
      const roomId = await saveRoom(
        db,
        isNew ? null : Number(id),
        { ...fields, name: fields.name.trim() || defaultName(), background },
        members
      )
      if (storedBackground.current && storedBackground.current !== background) removeAvatar(storedBackground.current, 'backgrounds')
      if (isNew) router.replace(`/rooms/${roomId}`)
      else router.back()
    } catch (err) {
      setSaving(false)
      showMessage(t('editor.saveFailedTitle'), errorMessage(err))
    }
  }

  const confirmDelete = () => {
    confirmDeletion({
      title: t('roomEditor.deleteConfirmTitle'),
      message: t('roomEditor.deleteConfirmMessage'),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        await deleteRoom(db, Number(id))
        if (storedBackground.current) removeAvatar(storedBackground.current, 'backgrounds')
        router.dismissTo('/rooms')
      },
    })
  }

  const title = isNew ? t('roomEditor.newTitle') : t('roomEditor.title')

  return (
    <View style={styles.screen}>
      {ready ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
        >
          <FieldRow
            label={t('roomEditor.nameLabel')}
            value={fields.name}
            onChangeText={(v) => set('name', v)}
            placeholder={defaultName() || t('roomEditor.namePlaceholder')}
            autoCapitalize="sentences"
          />

          <Divider />

          <View style={styles.sectionHeader}>
            <Eyebrow label={t('roomEditor.membersSection')} color={colors.text} />
            <Pressable onPress={() => setPicking(true)} hitSlop={8}>
              <Text style={styles.link}>{t('roomEditor.addMembers')}</Text>
            </Pressable>
          </View>
          {members.length ? null : <Text style={styles.note}>{t('roomEditor.noMembers')}</Text>}
          {members.map((member, index) => {
            const open = expanded === member.characterId
            return (
              <View key={member.characterId} style={styles.member}>
                <Pressable
                  onPress={() => setExpanded(open ? null : member.characterId)}
                  style={({ pressed }) => [styles.memberHead, pressed && { opacity: 0.7 }]}
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
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
                </Pressable>
                {open ? (
                  <View style={styles.memberSettings}>
                    <ParamSlider
                      label={t('roomEditor.talkativeness')}
                      value={member.talkativeness}
                      min={0}
                      max={1}
                      step={0.05}
                      formatValue={percent}
                      onChange={(v) => updateMember(member.characterId, { talkativeness: Math.round(v * 100) / 100 })}
                    />
                    <ParamSlider
                      label={t('roomEditor.perception')}
                      value={member.perception}
                      min={0}
                      max={1}
                      step={0.05}
                      formatValue={percent}
                      onChange={(v) => updateMember(member.characterId, { perception: Math.round(v * 100) / 100 })}
                    />
                    <Text style={styles.hint}>{t('roomEditor.perceptionHint')}</Text>
                    <FieldRow
                      label={t('roomEditor.triggers')}
                      hint={t('roomEditor.triggersHint')}
                      value={member.triggers}
                      onChangeText={(v) => updateMember(member.characterId, { triggers: v })}
                      placeholder={t('roomEditor.triggersPlaceholder')}
                      star={false}
                    />
                    <ToggleRow
                      label={t('roomEditor.present')}
                      note={t('roomEditor.presentNote')}
                      value={member.present}
                      onValueChange={(v) => updateMember(member.characterId, { present: v })}
                    />
                    <ToggleRow
                      label={t('roomEditor.muted')}
                      note={t('roomEditor.mutedNote')}
                      value={member.muted}
                      onValueChange={(v) => updateMember(member.characterId, { muted: v })}
                    />
                    <Pressable
                      onPress={() => setMembers((list) => list.filter((m) => m.characterId !== member.characterId))}
                      hitSlop={8}
                    >
                      <Text style={styles.linkDanger}>{t('roomEditor.removeMember')}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )
          })}

          <Divider />

          <Eyebrow label={t('roomEditor.floorSection')} color={colors.text} />
          <ChipGroup style={styles.chips} options={FLOOR_OPTIONS} value={fields.floor} onChange={(v) => set('floor', v)} />
          <Text style={styles.note}>{t(`room.floorHint.${fields.floor}`)}</Text>
          <View style={styles.gap} />
          <ParamSlider
            label={t('roomEditor.maxChain')}
            value={fields.maxChain}
            min={1}
            max={5}
            step={1}
            onChange={(v) => set('maxChain', v)}
          />
          <Text style={[styles.hint, styles.gapBelow]}>{t('roomEditor.maxChainHint')}</Text>
          <ToggleRow
            label={t('roomEditor.director')}
            note={t('roomEditor.directorNote')}
            value={fields.director}
            onValueChange={(v) => set('director', v)}
          />

          <Divider />

          <Eyebrow label={t('roomEditor.sceneSection')} color={colors.text} />
          <FieldRow
            label={t('roomEditor.scenario')}
            hint={t('roomEditor.scenarioHint')}
            value={fields.scenario}
            onChangeText={(v) => set('scenario', v)}
            placeholder={t('roomEditor.scenarioPlaceholder')}
            multiline
            expandTitle={t('roomEditor.scenario')}
          />
          <FieldRow
            label={t('roomEditor.opening')}
            hint={t('roomEditor.openingHint')}
            value={fields.opening}
            onChangeText={(v) => set('opening', v)}
            placeholder={t('roomEditor.openingPlaceholder')}
            multiline
            expandTitle={t('roomEditor.opening')}
          />
          <FieldRow
            label={t('roomEditor.userName')}
            hint={t('roomEditor.userNameHint')}
            value={fields.userName}
            onChangeText={(v) => set('userName', v)}
            placeholder={t('roomEditor.userNamePlaceholder')}
            autoCapitalize="words"
          />

          <Divider />

          <Eyebrow label={t('background.title')} color={colors.text} />
          <View style={styles.backgroundRow}>
            <View style={styles.backgroundThumb}>
              {backgroundUri ? (
                <ChatBackground uri={backgroundUri} effect={fields.backgroundEffect} intensity={fields.backgroundIntensity} />
              ) : null}
            </View>
            <View style={styles.backgroundActions}>
              <ImageSourceMenu onPick={onPickBackground}>
                <Text style={styles.link}>{backgroundUri ? t('background.change') : t('background.choose')}</Text>
              </ImageSourceMenu>
              {backgroundUri ? (
                <>
                  <Pressable onPress={() => openBackground(backgroundUri, false)} hitSlop={8}>
                    <Text style={styles.link}>{t('background.adjust')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setBgPickedUri(null)
                      set('background', null)
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.linkMuted}>{t('background.remove')}</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>

          {!isNew ? (
            <>
              <Divider />
              <PillButton filled label={t('roomEditor.deleteRoom')} onPress={confirmDelete} color={colors.danger} />
            </>
          ) : null}
        </KeyboardAwareScrollView>
      ) : null}

      <PageSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t('roomEditor.pickTitle')}
        right={
          <Pressable onPress={() => setPicking(false)} hitSlop={8}>
            <Text style={styles.done}>{t('roomEditor.done')}</Text>
          </Pressable>
        }
      >
        <ScrollView contentContainerStyle={styles.pickList}>
          {characters.length ? null : <Text style={styles.note}>{t('roomEditor.noCharacters')}</Text>}
          {characters.map((character) => {
            const on = members.some((m) => m.characterId === character.id)
            return (
              <Pressable
                key={character.id}
                onPress={() => toggleCharacter(character)}
                style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.7 }]}
              >
                <Avatar name={character.name} file={character.avatar} size={40} viewable={false} />
                <Text style={styles.pickName} numberOfLines={1}>
                  {character.name}
                </Text>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={on ? colors.accent : colors.textFaint}
                />
              </Pressable>
            )
          })}
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
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chips: { marginBottom: 16 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
    hint: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: -4, marginBottom: 16 },
    gap: { height: 16 },
    gapBelow: { marginBottom: 16 },
    link: { color: colors.accent, fontSize: 15 },
    linkMuted: { color: colors.textMuted, fontSize: 15 },
    linkDanger: { color: colors.danger, fontSize: 15, marginTop: 4 },
    member: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginBottom: 10,
      overflow: 'hidden',
    },
    memberHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
    memberBody: { flex: 1 },
    memberName: { fontSize: 16, fontWeight: '600' },
    memberMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    memberSettings: {
      paddingHorizontal: 14,
      paddingTop: 6,
      paddingBottom: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    backgroundRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
    backgroundThumb: { width: 72, height: 96, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
    backgroundActions: { flex: 1, gap: 12, alignItems: 'flex-start' },
    done: { color: colors.accent, fontSize: 16, fontWeight: '600' },
    pickList: { padding: 16, gap: 4 },
    pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    pickName: { flex: 1, color: colors.text, fontSize: 16 },
  })
