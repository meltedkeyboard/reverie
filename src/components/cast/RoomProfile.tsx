import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { Character } from '@/db/characters'
import type { MemberSettings, RoomFields } from '@/db/rooms'
import { useTranslation, type t as translate } from '@/i18n'
import { useColors, useStyles, type Colors } from '@/theme'

import { ListSection } from '../lists/GroupedList'
import type { MenuItem } from '../overlays/NativeMenu'
import { Avatar } from '../visuals/Avatar'
import { Icon } from '../visuals/Icon'
import { ProfileActions, ProfileBackground, ProfileParams, ProfileText } from './CharacterProfile'

type Member = MemberSettings & { character: Character }

type Props = {
  fields: RoomFields
  members: Member[]
  background: React.ComponentProps<typeof ProfileBackground>['background']
  // The rows of the export group at the bottom; without them there is none.
  exportItems?: MenuItem[]
}

const percent = (value: number) => `${Math.round(value * 100)}%`

// How a member takes part, in one line: out of the scene, only listening, or how eager they
// are to speak and how keen their ear is. The same in the profile and in the editor.
export function memberSummary(member: MemberSettings, t: typeof translate) {
  if (!member.present) return t('roomEditor.outOfScene')
  if (member.muted) return t('roomEditor.listensOnly')
  return t('roomEditor.memberSummary', { talk: percent(member.talkativeness), ear: percent(member.perception) })
}

// A room to look at rather than to edit, as a character's profile is: who is in it, the
// scene they share, how the talk goes and the background, in the grouped look of the
// editor. A member opens their own profile. Empty parts are left out.
export function RoomProfile({ fields, members, background, exportItems }: Props) {
  const router = useRouter()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const onOff = (on: boolean) => (on ? t('editor.thinkingOn') : t('editor.thinkingOff'))
  return (
    <View>
      <ListSection header={t('roomEditor.membersSection')} footer={members.length ? undefined : t('roomEditor.noMembers')}>
        {members.map((member, index) => (
          <Pressable
            key={member.characterId}
            onPress={() => router.push(`/character/${member.characterId}?profile=1`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.member, pressed && styles.pressed]}
          >
            <Avatar name={member.character.name} file={member.character.avatar} size={36} />
            <View style={styles.memberBody}>
              <Text style={[styles.memberName, { color: colors.cast[index % colors.cast.length] }]} numberOfLines={1}>
                {member.character.name}
              </Text>
              <Text style={styles.memberMeta} numberOfLines={1}>
                {memberSummary(member, t)}
              </Text>
            </View>
            <Icon name="chevron-forward" size={14} color={colors.textFaint} />
          </Pressable>
        ))}
      </ListSection>
      <ProfileText header={t('roomEditor.scenario')} text={fields.scenario} lines={6} />
      <ProfileText header={t('roomEditor.opening')} text={fields.opening} lines={4} />
      <ProfileParams
        header={t('roomProfile.settings')}
        params={[
          { label: t('room.floorTitle'), value: t(`room.floor.${fields.floor}`) },
          { label: t('roomEditor.maxChain'), value: String(fields.maxChain) },
          { label: t('roomEditor.director'), value: onOff(fields.director) },
          ...(fields.userName.trim() ? [{ label: t('roomEditor.userName'), value: fields.userName.trim() }] : []),
        ]}
      />
      <ProfileBackground background={background} />
      {exportItems ? <ProfileActions header={t('rooms.export')} items={exportItems} /> : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    pressed: { backgroundColor: colors.surfaceRaised },
    memberBody: { flex: 1 },
    memberName: { fontSize: 17, fontWeight: '600' },
    memberMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  })
