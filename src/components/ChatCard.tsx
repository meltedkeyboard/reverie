import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { ChatPreview } from '@/db/chats'
import { useTranslation } from '@/i18n'
import { formatWhen, plural } from '@/lib/format'
import { plainPreview } from '@/lib/roleplay'
import { useColors, useStyles, type Colors } from '@/theme'

import { IconButton } from './IconButton'

type Props = {
  chat: ChatPreview
  onOpen: () => void
  onMenu: () => void
}

export function ChatCard({ chat, onOpen, onMenu }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const preview = plainPreview(chat.lastMessage ?? '') || t('chatCard.emptyChat')
  const count = chat.messageCount
  const when = formatWhen(chat.lastActivity, locale)
  const messages = `${count} ${plural(count, locale, ['сообщение', 'сообщения', 'сообщений'], ['message', 'messages'])}`
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onMenu}
      style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.985 }], opacity: 0.9 }]}
    >
      <View style={styles.body}>
        <Text style={styles.heading} numberOfLines={1}>
          {chat.title ?? when}
        </Text>
        <Text style={styles.meta}>{chat.title ? `${when}, ${messages}` : messages}</Text>
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
      </View>
      <IconButton name="ellipsis-horizontal" size={18} color={colors.textFaint} onPress={onMenu} />
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 6,
  },
  body: { flex: 1 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textFaint, fontSize: 13, marginTop: 2, marginBottom: 4 },
  preview: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
})
