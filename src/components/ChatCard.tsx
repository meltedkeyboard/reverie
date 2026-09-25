import { StyleSheet, Text, View } from 'react-native'

import type { ChatPreview } from '@/db/chats'
import { useTranslation } from '@/i18n'
import { formatWhen, plural } from '@/lib/format'
import { plainPreview } from '@/lib/roleplay'
import { useStyles, type Colors } from '@/theme'

import { ListCard } from './ListCard'
import type { MenuItem } from './NativeMenu'

type Props = {
  chat: ChatPreview
  onOpen: () => void
  onDelete: () => void
  menu: MenuItem[]
}

export function ChatCard({ chat, onOpen, onDelete, menu }: Props) {
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const preview = plainPreview(chat.lastMessage ?? '') || t('chatCard.emptyChat')
  const count = chat.messageCount
  const when = formatWhen(chat.lastActivity, locale)
  const messages = `${count} ${plural(count, locale, ['сообщение', 'сообщения', 'сообщений'], ['message', 'messages'])}`
  return (
    <ListCard onOpen={onOpen} onDelete={onDelete} menu={menu} menuTitle={chat.title ?? undefined}>
      <View style={styles.body}>
        <Text style={styles.heading} numberOfLines={1}>
          {chat.title ?? when}
        </Text>
        <Text style={styles.meta}>{chat.title ? `${when}, ${messages}` : messages}</Text>
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
      </View>
    </ListCard>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  body: { flex: 1 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textFaint, fontSize: 13, marginTop: 2, marginBottom: 4 },
  preview: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
})
