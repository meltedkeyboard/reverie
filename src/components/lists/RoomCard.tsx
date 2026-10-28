import { StyleSheet, Text, View } from 'react-native'

import type { RoomPreview } from '@/db/rooms'
import { useTranslation } from '@/i18n'
import { countLabel } from '@/lib/core/format'
import { plainPreview } from '@/lib/chat/roleplay'
import { type Colors, useStyles } from '@/theme'

import { AnimatedFill } from '../visuals/AnimatedFill'
import { CastMosaic } from '../cast/CastMosaic'
import { FeaturedBody } from '../cast/FeaturedBody'
import { CARD_CORNERS_CONTINUOUS, CARD_RADIUS, ListCard } from './ListCard'
import type { MenuItem } from '../overlays/NativeMenu'
import { DraggableCard, unlessDragging } from './DraggableCard'

type Props = {
  room: RoomPreview
  onOpen: () => void
  onDelete: () => void
  menu: MenuItem[]
  // A single room: one card this tall, filling the screen: its cast on top as a full-width
  // square and the text under it taking the rest.
  fillHeight?: number
  editing?: React.ComponentProps<typeof ListCard>['editing']
}

function RoomCardContent({ room, onOpen, onDelete, menu, fillHeight, editing }: Props) {
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const preview = roomPreview(room, t('rooms.noMembers'))
  const scenes = room.chatCount
  if (fillHeight !== undefined) {
    return (
      <ListCard vertical longPressDrag={editing?.active} onOpen={onOpen} onDelete={onDelete} menu={menu} menuTitle={room.name} style={[styles.featured, { height: fillHeight }]}>
        <View style={styles.hero}>
          <CastMosaic cast={room.cast} name={room.name} size={200} corners={HERO_CORNERS} fill viewable />
        </View>
        <FeaturedBody name={room.name} count={scenes > 0 ? countLabel(scenes, 'scene', locale) : null} preview={preview} />
      </ListCard>
    )
  }
  return (
    <ListCard longPressDrag={editing?.active} editing={editing} onOpen={onOpen} onDelete={onDelete} menu={menu} menuTitle={room.name} style={styles.card}>
      <View style={styles.cast}>
        <CastMosaic cast={room.cast} name={room.name} size={AVATAR} corners={ROW_CORNERS} fill viewable />
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {room.name}
          </Text>
          {scenes > 0 ? <Text style={styles.count}>{countLabel(scenes, 'scene', locale)}</Text> : null}
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
      </View>
    </ListCard>
  )
}

// The line under a room's name: who said what last, or else the scenario, the cast's names,
// or `empty` for a room with nobody in it.
export function roomPreview(room: RoomPreview, empty: string) {
  const last = plainPreview(room.lastMessage ?? '')
  if (last) return room.lastSpeaker ? `${room.lastSpeaker}: ${last}` : last
  return plainPreview(room.scenario) || room.cast.map((m) => m.name).join(', ') || empty
}

// The cast fills the card's left edge from top to bottom, as a character's avatar does on
// its card, and the card's rounded corners clip it.
const AVATAR = 88
const ROW_CORNERS = { topLeft: CARD_RADIUS, bottomLeft: CARD_RADIUS, continuous: CARD_CORNERS_CONTINUOUS }
const HERO_CORNERS = { topLeft: CARD_RADIUS, topRight: CARD_RADIUS, continuous: CARD_CORNERS_CONTINUOUS }

// The card draws itself; the wrapper only animates the change between row and full screen.
// On iOS a long press brings the system menu, as on a character's card; there is nothing
// to drag out of a room's.
export function RoomCard(props: Props) {
  return (
    <AnimatedFill fillHeight={props.fillHeight}>
      <DraggableCard menu={props.menu} items={[]} dragEnabled={!props.editing?.active} draggable={false}>
        <RoomCardContent {...props} onOpen={unlessDragging(props.onOpen)} />
      </DraggableCard>
    </AnimatedFill>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    card: { gap: 14, paddingLeft: 0, paddingVertical: 0, minHeight: AVATAR, overflow: 'hidden' },
    cast: { width: AVATAR, alignSelf: 'stretch' },
    body: { flex: 1, paddingVertical: 12 },
    featured: { overflow: 'hidden' },
    hero: { aspectRatio: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 },
    name: { flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
    count: { color: colors.textFaint, fontSize: 13 },
    preview: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
  })
