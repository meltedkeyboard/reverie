import { StyleSheet, Text, View, ScrollView } from 'react-native'

import { ChatBackground } from '@/components/chat/ChatBackground'
import { GlassBubble, GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { Icon } from '@/components/visuals/Icon'
import { Markdown } from '@/components/chat/Markdown'
import { useTranslation } from '@/i18n'
import { CHAT_METRICS, useChatTextSettings } from '@/lib/chat/chatText'
import { withAlpha } from '@/lib/core/color'
import { isIOS } from '@/lib/core/platform'
import { avatarUri, cropFromJson } from '@/lib/images/avatars'
import { type Colors, useStyles, useColors } from '@/theme'

const FIELD_HEIGHT = 48
export const PREVIEW_HEIGHT = 20 + 200 + 12 + FIELD_HEIGHT + 12

export function ChatPreview({ flush = false }: { flush?: boolean }) {
  const colors = useColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { font, userFont, userMarkdown, bubbleGlass, pattern, wallpaper, scale } = useChatTextSettings()
  const wallpaperUri = wallpaper?.file ? avatarUri(wallpaper.file, 'backgrounds') : null
  const fontFamily = font
  const scaled = (value: number) => value * scale

  const bot = {
    color: colors.text,
    letterSpacing: 0.1,
    fontFamily,
    fontSize: scaled(CHAT_METRICS.bot.size),
    lineHeight: scaled(CHAT_METRICS.bot.line),
  }

  const user = {
    color: colors.text,
    fontFamily: userFont ? fontFamily : undefined,
    fontSize: scaled(CHAT_METRICS.user.size),
    lineHeight: scaled(CHAT_METRICS.user.line),
  }

  const isGlass = isIOS && (bubbleGlass || (pattern === 'custom' && !!wallpaper?.file && !!wallpaper?.bubbleGlass))

  return (
    <View style={[styles.card, flush && styles.cardFlush]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {pattern === 'custom' && wallpaperUri ? (
          <ChatBackground
            uri={wallpaperUri}
            crop={cropFromJson(wallpaper?.crop ?? null)}
            effect={wallpaper?.effect ?? 'blur'}
            intensity={wallpaper?.intensity ?? 0.5}
          />
        ) : null}
      </View>
      <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
        {isGlass ? (
          <GlassBubble style={[styles.bubble, styles.glassBubble]}>
            {userMarkdown ? (
              <Markdown text={t('chatPreview.user')} style={user} selectable={false} />
            ) : (
              <Text style={user}>{t('chatPreview.user')}</Text>
            )}
          </GlassBubble>
        ) : (
          <View
            style={[
              styles.bubble,
              pattern === 'custom' && wallpaper?.file
                ? { backgroundColor: withAlpha(colors.bubble, 1 - (wallpaper.bubbleTransparency ?? 0.3)) }
                : null,
            ]}
          >
            {userMarkdown ? (
              <Markdown text={t('chatPreview.user')} style={user} selectable={false} />
            ) : (
              <Text style={user}>{t('chatPreview.user')}</Text>
            )}
          </View>
        )}
        <Markdown text={t('chatPreview.reply')} style={bot} emStyle={styles.action} />
      </ScrollView>
      <View style={styles.composer}>
        <GlassSurface interactive style={[glass.circle, styles.circle]} fallbackStyle={glass.solid}>
          <Icon name="add" size={24} color={colors.text} />
        </GlassSurface>
        <GlassSurface interactive style={styles.field} fallbackStyle={glass.solid}>
          <Text style={styles.placeholder} numberOfLines={1}>
            {t('chat.messagePlaceholder')}
          </Text>
          <View style={styles.send}>
            <Icon name="arrow-up" size={18} color={colors.textFaint} />
          </View>
        </GlassSurface>
      </View>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      borderRadius: 26,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 12,
      marginBottom: 28,
    },
    cardFlush: { flex: 1, marginBottom: 0, borderRadius: 0 },
    messages: { height: 200, marginBottom: 12 },
    messagesContent: { gap: 16 },
    glassBubble: {
      backgroundColor: withAlpha(colors.bubble, 0.25),
      borderColor: colors.borderStrong,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    bubble: {
      alignSelf: 'flex-end',
      marginLeft: 40,
      backgroundColor: colors.bubble,
      borderRadius: 20,
      borderCurve: 'continuous',
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    action: { fontStyle: 'italic', color: colors.textMuted },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    circle: { width: FIELD_HEIGHT, height: FIELD_HEIGHT, borderRadius: FIELD_HEIGHT / 2 },
    field: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: FIELD_HEIGHT,
      borderRadius: 26,
      padding: 5,
    },
    placeholder: { flex: 1, color: colors.textFaint, fontSize: 17, paddingHorizontal: 14 },
    send: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
    },
  })
