import Ionicons from '@expo/vector-icons/Ionicons'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { LastChat } from '@/db/chats'
import { useTranslation } from '@/i18n'
import { formatWhen } from '@/lib/format'
import { useColors, useStyles, type Colors } from '@/theme'

import { Avatar } from './Avatar'
import { GlassSurface } from './Glass'
import { SwipeToDelete } from './SwipeToDelete'

type Props = {
  chat: LastChat
  onOpen: () => void
  onDismiss: () => void
}

// Text on the accent-tinted glass, as on the glass Button.
const ON_ACCENT = '#FFFFFF'
const ON_ACCENT_MUTED = 'rgba(255, 255, 255, 0.75)'
const ON_ACCENT_FAINT = 'rgba(255, 255, 255, 0.6)'

const HEIGHT = 56

// How much room the list leaves under its last card for the button.
export const CONTINUE_BUTTON_SPACE = HEIGHT + 20

// A glass capsule floating over the bottom of the home screen that opens the last chat,
// and swipes away like a row in a list.
export function ContinueButton({ chat, onOpen, onDismiss }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { t, locale } = useTranslation()

  return (
    <View style={[styles.slot, { bottom: insets.bottom + 8 }]} pointerEvents="box-none">
      <SwipeToDelete
        throwAway
        radius={HEIGHT / 2}
        label={t('continue.hide')}
        contentLabel={t('continue.accessibility')}
        onPress={onOpen}
        onDelete={onDismiss}
      >
        <GlassSurface interactive tintColor={colors.accent} style={styles.pill} fallbackStyle={styles.solid}>
          <Avatar name={chat.characterName} file={chat.characterAvatar} size={HEIGHT - 16} viewable={false} />
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>
              {chat.characterName}
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {chat.title ?? formatWhen(chat.lastActivity, locale)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={ON_ACCENT_FAINT} />
        </GlassSurface>
      </SwipeToDelete>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    slot: { position: 'absolute', left: 16, right: 16 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      height: HEIGHT,
      borderRadius: HEIGHT / 2,
      padding: 8,
      paddingRight: 16,
    },
    solid: { backgroundColor: colors.accent },
    text: { flex: 1 },
    name: { color: ON_ACCENT, fontSize: 16, fontWeight: '600' },
    title: { color: ON_ACCENT_MUTED, fontSize: 13, marginTop: 1 },
  })
