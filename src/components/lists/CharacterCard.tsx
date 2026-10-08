import { StyleSheet, Text, View } from 'react-native'

import type { CharacterPreview } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { countLabel } from '@/lib/core/format'
import { characterPreview } from '@/lib/chat/roleplay'
import { useStyles, type Colors } from '@/theme'

import { AnimatedFill } from '../visuals/AnimatedFill'
import { Avatar } from '../visuals/Avatar'
import { FeaturedBody } from '../cast/FeaturedBody'
import { ListCard } from './ListCard'
import type { MenuItem } from '../overlays/NativeMenu'
import { DragCardView, type DragMenuEntry } from '../../../modules/reverie-drag'

type Props = {
  character: CharacterPreview
  onOpen: () => void
  onDelete: () => void
  menu: MenuItem[]
  // A single character: one card this tall, filling the screen: a full-width square picture
  // on top and the text under it taking the rest.
  fillHeight?: number
  editing?: { active: boolean; checked: boolean; onToggle: () => void }
  // A drop asked for the dragged character as a file: the whole archive, or the card PNG.
  onProvide?: (token: string, kind: 'archive' | 'card') => void
}

function CharacterCardContent({ character, onOpen, onDelete, menu, fillHeight, editing }: Props) {
  const styles = useStyles(createStyles)
  const { locale } = useTranslation()
  const preview = characterPreview(character)
  const chats = character.chatCount
  if (fillHeight !== undefined) {
    return (
      <ListCard vertical solid longPressDrag={false} onOpen={onOpen} onDelete={onDelete} menu={menu} menuTitle={character.name} style={[styles.featured, { height: fillHeight }]}>
        <View style={styles.hero}>
          <Avatar name={character.name} file={character.avatar} size={200} square fill />
        </View>
        <FeaturedBody
          name={character.name}
          count={chats > 0 ? countLabel(chats, 'chat', locale) : null}
          preview={preview}
        />
      </ListCard>
    )
  }
  return (
    <ListCard solid longPressDrag={false} editing={editing} onOpen={onOpen} onDelete={onDelete} menu={menu} menuTitle={character.name} style={styles.card}>
      <View style={styles.avatar}>
        <Avatar name={character.name} file={character.avatar} size={AVATAR} square fill />
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {character.name}
          </Text>
          {chats > 0 ? (
            <Text style={styles.chats}>
              {countLabel(chats, 'chat', locale)}
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

// The avatar fills the card's left edge from top to bottom, and the card's rounded
// corners clip it. It is as tall as a card with a name and two preview lines, and
// stretches with the card when a larger text size makes the card taller.
const AVATAR = 88

const toEntries = (items: MenuItem[]): DragMenuEntry[] =>
  items.map(({ label, systemImage, destructive, children }) => ({ label, systemImage, destructive, children: children && toEntries(children) }))

// The card draws itself; the wrapper only animates the change between row and full screen.
// On iOS a long press is the system's: the menu, and moving the finger lifts the card to
// drop into Files, Photos or another app, with a tap on other cards adding them to the stack.
export function CharacterCard(props: Props) {
  const content = <CharacterCardContent {...props} />
  return (
    <AnimatedFill fillHeight={props.fillHeight}>
      {DragCardView ? (
        <DragCardView
          menu={toEntries(props.menu)}
          dragEnabled={!props.editing?.active}
          name={props.character.name}
          cornerRadius={20}
          onMenuSelect={({ nativeEvent }) => {
            let item: MenuItem | undefined = { label: '', children: props.menu }
            for (const index of nativeEvent.path) item = item?.children?.[index]
            item?.onSelect?.()
          }}
          onProvide={({ nativeEvent }) => props.onProvide?.(nativeEvent.token, nativeEvent.kind)}
        >
          {content}
        </DragCardView>
      ) : (
        content
      )}
    </AnimatedFill>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  card: { gap: 14, paddingLeft: 0, paddingVertical: 0, minHeight: AVATAR, overflow: 'hidden' },
  avatar: { width: AVATAR, alignSelf: 'stretch' },
  body: { flex: 1, paddingVertical: 12 },
  featured: { overflow: 'hidden' },
  hero: { aspectRatio: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 },
  name: { flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
  chats: { color: colors.textFaint, fontSize: 13 },
  preview: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
})
