import { StyleSheet, Text, View } from 'react-native'

import type { RoomPreview } from '@/db/rooms'
import { useTranslation } from '@/i18n'
import { plural } from '@/lib/format'
import { plainPreview } from '@/lib/roleplay'
import { useStyles, type Colors } from '@/theme'

import { AvatarStack } from './AvatarStack'
import { ListCard } from './ListCard'
import type { MenuItem } from './NativeMenu'

type Props = {
  room: RoomPreview
  onOpen: () => void
  onDelete: () => void
  menu: MenuItem[]
}

export function RoomCard({ room, onOpen, onDelete, menu }: Props) {
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const last = plainPreview(room.lastMessage ?? '')
  const preview = last
    ? room.lastSpeaker
      ? `${room.lastSpeaker}: ${last}`
      : last
    : plainPreview(room.scenario) || room.cast.map((m) => m.name).join(', ') || t('rooms.noMembers')
  const scenes = room.chatCount
  return (
    <ListCard onOpen={onOpen} onDelete={onDelete} menu={menu} menuTitle={room.name} style={styles.card}>
      <View style={styles.faces}>
        <AvatarStack cast={room.cast} size={40} max={3} />
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {room.name}
          </Text>
          {scenes > 0 ? (
            <Text style={styles.count}>
              {scenes} {plural(scenes, locale, ['сцена', 'сцены', 'сцен'], ['scene', 'scenes'])}
            </Text>
          ) : null}
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
      </View>
    </ListCard>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    card: { gap: 14, minHeight: 76 },
    faces: { minWidth: 64, alignItems: 'flex-start' },
    body: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 },
    name: { flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
    count: { color: colors.textFaint, fontSize: 13 },
    preview: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
  })
