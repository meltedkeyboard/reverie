import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { CharacterPreview } from '@/db/characters'
import { plural } from '@/lib/format'
import { plainPreview } from '@/lib/roleplay'
import { useColors } from '@/theme'

import { Avatar } from './Avatar'
import { IconButton } from './IconButton'

type Props = {
  character: CharacterPreview
  onOpen: () => void
  onMenu: () => void
}

export function CharacterCard({ character, onOpen, onMenu }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const preview = plainPreview(character.lastMessage ?? character.systemPrompt) || 'Без описания'
  const chats = character.chatCount
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onMenu}
      style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.985 }], opacity: 0.9 }]}
    >
      <Avatar name={character.name} file={character.avatar} size={56} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {character.name}
          </Text>
          {chats > 0 ? (
            <Text style={styles.chats}>
              {chats} {plural(chats, 'чат', 'чата', 'чатов')}
            </Text>
          ) : null}
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
      </View>
      <IconButton name="ellipsis-horizontal" size={18} color={colors.textFaint} onPress={onMenu} />
    </Pressable>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 6,
  },
  body: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 },
  name: { flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
  chats: { color: colors.textFaint, fontSize: 13 },
  preview: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
})
