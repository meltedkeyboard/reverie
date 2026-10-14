import { StyleSheet, Text, View } from 'react-native'

import type { CharacterPreview } from '@/db/characters'
import type { CharacterGroup } from '@/db/groups'
import { useTranslation } from '@/i18n'
import { countLabel } from '@/lib/core/format'
import { useColors, useStyles, type Colors } from '@/theme'

import { AvatarStack } from '../cast/AvatarStack'
import { SFIcon } from '../visuals/SFIcon'
import { DraggableCard, unlessDragging } from './DraggableCard'
import { ListCard } from './ListCard'
import type { MenuItem } from '../overlays/NativeMenu'

type Props = {
  group: CharacterGroup
  members: CharacterPreview[]
  onOpen: () => void
  // A swipe to the left: the group with all its characters, after asking.
  onDelete: () => void
  // A swipe to the right: the characters stay, the group goes.
  onUngroup: () => void
  menu: MenuItem[]
  editing?: React.ComponentProps<typeof ListCard>['editing']
  onDropCards: (ids: number[]) => void
  onProvide?: (token: string, kind: 'archive' | 'card', id: number) => void
}

// As tall as a character's card: up to three faces in circles as on a room's card, the
// group's own name or else its members' names, and a chevron pointing right to open the group.
export function GroupCard({ group, members, onOpen, onDelete, onUngroup, menu, editing, onDropCards, onProvide }: Props) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t, locale } = useTranslation()
  const names = members.map((m) => m.name).join(', ')

  return (
    <DraggableCard
      menu={menu}
      items={members.map((m) => ({ id: m.id, name: m.name }))}
      dragEnabled={!editing?.active}
      groupIds={members.map((m) => m.id)}
      onDropCards={onDropCards}
      onProvide={onProvide}
    >
      <ListCard
        longPressDrag={editing?.active}
        editing={editing}
        onOpen={unlessDragging(onOpen)}
        onDelete={onDelete}
        leading={{ label: t('groups.ungroup'), icon: 'albums-outline', color: colors.accent, onAction: onUngroup }}
        menu={menu}
        menuTitle={group.name ?? names}
        style={styles.card}
        trailing={<SFIcon name="chevron.right" fallback="chevron-forward" size={16} color={colors.textFaint} />}
      >
        <View style={styles.faces}>
          <AvatarStack cast={members} size={40} max={3} viewable={false} />
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {group.name ?? names}
          </Text>
          <Text style={styles.count}>{countLabel(members.length, 'character', locale)}</Text>
        </View>
      </ListCard>
    </DraggableCard>
  )
}

// The height of a character's card, whose avatar sets it.
const HEIGHT = 88

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    card: { gap: 14, minHeight: HEIGHT },
    faces: { minWidth: 64, alignItems: 'flex-start' },
    body: { flex: 1 },
    name: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 3 },
    count: { color: colors.textFaint, fontSize: 13 },
  })
