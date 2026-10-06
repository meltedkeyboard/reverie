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

type Props = {
  character: CharacterPreview
  onOpen: () => void
  onDelete: () => void
  menu: MenuItem[]
  // A single character: one card this tall, filling the screen: a full-width square picture
  // on top and the text under it taking the rest.
  fillHeight?: number
}

function CharacterCardContent({ character, onOpen, onDelete, menu, fillHeight }: Props) {
  const styles = useStyles(createStyles)
  const { locale } = useTranslation()
  const preview = characterPreview(character)
  const chats = character.chatCount
  if (fillHeight !== undefined) {
    return (
      <ListCard vertical onOpen={onOpen} onDelete={onDelete} menu={menu} menuTitle={character.name} style={[styles.featured, { height: fillHeight }]}>
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
    <ListCard onOpen={onOpen} onDelete={onDelete} menu={menu} menuTitle={character.name} style={styles.card}>
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

// The card draws itself; the wrapper only animates the change between row and full screen.
export function CharacterCard(props: Props) {
  return (
    <AnimatedFill fillHeight={props.fillHeight}>
      <CharacterCardContent {...props} />
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
