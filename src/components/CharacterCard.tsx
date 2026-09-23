import { StyleSheet, Text, View } from 'react-native'

import type { CharacterPreview } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { plural } from '@/lib/format'
import { characterPreview } from '@/lib/roleplay'
import { useStyles, type Colors } from '@/theme'

import { Avatar } from './Avatar'
import { ListCard } from './ListCard'

type Props = {
  character: CharacterPreview
  onOpen: () => void
  onMenu: () => void
}

export function CharacterCard({ character, onOpen, onMenu }: Props) {
  const styles = useStyles(createStyles)
  const { locale } = useTranslation()
  const preview = characterPreview(character)
  const chats = character.chatCount
  return (
    <ListCard onOpen={onOpen} onMenu={onMenu} style={styles.card}>
      <Avatar name={character.name} file={character.avatar} size={56} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {character.name}
          </Text>
          {chats > 0 ? (
            <Text style={styles.chats}>
              {chats} {plural(chats, locale, ['чат', 'чата', 'чатов'], ['chat', 'chats'])}
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
  card: { gap: 14, paddingLeft: 14 },
  body: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 },
  name: { flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
  chats: { color: colors.textFaint, fontSize: 13 },
  preview: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
})
