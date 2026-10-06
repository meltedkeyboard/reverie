import { StyleSheet, Text, View } from 'react-native'

import type { RoomPreview } from '@/db/rooms'
import { useTranslation } from '@/i18n'
import { countLabel } from '@/lib/core/format'
import { plainPreview } from '@/lib/chat/roleplay'
import { type Colors, FILL, ON_ACCENT, useStyles } from '@/theme'

import { AnimatedFill } from '../visuals/AnimatedFill'
import { Avatar } from '../visuals/Avatar'
import { AvatarStack } from '../cast/AvatarStack'
import { FeaturedBody } from '../cast/FeaturedBody'
import { ListCard } from './ListCard'
import type { MenuItem } from '../overlays/NativeMenu'

type Props = {
  room: RoomPreview
  onOpen: () => void
  onDelete: () => void
  menu: MenuItem[]
  // A single room: one card this tall, filling the screen: the cast on top as a grid of
  // whole squares and the text under it taking the rest.
  fillHeight?: number
}

const HERO_FACES = 4

function RoomCardContent({ room, onOpen, onDelete, menu, fillHeight }: Props) {
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const last = plainPreview(room.lastMessage ?? '')
  const preview = last
    ? room.lastSpeaker
      ? `${room.lastSpeaker}: ${last}`
      : last
    : plainPreview(room.scenario) || room.cast.map((m) => m.name).join(', ') || t('rooms.noMembers')
  const scenes = room.chatCount
  const count = scenes > 0 ? (
    <Text style={styles.count}>
      {countLabel(scenes, 'scene', locale)}
    </Text>
  ) : null
  if (fillHeight !== undefined) {
    const faces = room.cast.slice(0, HERO_FACES)
    const rest = room.cast.length - faces.length
    // One member fills the width; two or more are tiles of half the width, each a square,
    // so no picture is stretched or cut. A third member leaves an empty fourth tile.
    const tile = faces.length === 1 || !faces.length ? styles.tileWhole : styles.tileHalf
    return (
      <ListCard vertical onOpen={onOpen} onDelete={onDelete} menu={menu} menuTitle={room.name} style={[styles.featured, { height: fillHeight }]}>
        <View style={styles.hero}>
          {faces.length ? (
            faces.map((member, index) => (
              <View key={index} style={tile}>
                <Avatar name={member.name} file={member.avatar} size={120} square fill viewable={false} />
                {rest > 0 && index === faces.length - 1 ? (
                  <View style={styles.more}>
                    <Text style={styles.moreText}>+{rest}</Text>
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <View style={tile}>
              <Avatar name={room.name} size={200} square fill viewable={false} />
            </View>
          )}
          {faces.length === 3 ? <View style={[tile, styles.empty]} /> : null}
        </View>
        <FeaturedBody
          name={room.name}
          count={scenes > 0 ? countLabel(scenes, 'scene', locale) : null}
          preview={preview}
        />
      </ListCard>
    )
  }
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
          {count}
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
      </View>
    </ListCard>
  )
}

// The card draws itself; the wrapper only animates the change between row and full screen.
export function RoomCard(props: Props) {
  return (
    <AnimatedFill fillHeight={props.fillHeight}>
      <RoomCardContent {...props} />
    </AnimatedFill>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    card: { gap: 14, minHeight: 76 },
    faces: { minWidth: 64, alignItems: 'flex-start' },
    body: { flex: 1 },
    featured: { overflow: 'hidden' },
    hero: { flexDirection: 'row', flexWrap: 'wrap' },
    tileWhole: { width: '100%', aspectRatio: 1 },
    tileHalf: { width: '50%', aspectRatio: 1, borderWidth: 1, borderColor: colors.bg },
    empty: { backgroundColor: colors.surfaceRaised },
    more: { ...FILL, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
    moreText: { color: ON_ACCENT, fontSize: 22, fontWeight: '600' },
    nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 },
    name: { flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
    count: { color: colors.textFaint, fontSize: 13 },
    preview: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
  })
