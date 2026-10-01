import Ionicons from '@expo/vector-icons/Ionicons'
import Slider from '@react-native-community/slider'
import { useMemo } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'

import { FormScreenHeader } from '@/components/FormScreenHeader'
import { GlassSurface, useGlassStyles } from '@/components/Glass'
import { useScreenPadding } from '@/components/GlassHeader'
import { Markdown } from '@/components/Markdown'
import { FieldRow } from '@/components/motifs/FieldRow'
import type { MenuItem } from '@/components/NativeMenu'
import { PillButton } from '@/components/PillButton'
import { CHAT_TEXT_SCALE_RANGE, DEFAULT_CHAT_FONT, SYSTEM_FONT } from '@/db/settings'
import { useTranslation } from '@/i18n'
import { CHAT_METRICS, useChatTextSettings } from '@/lib/chatText'
import { installedFontFamilies } from '../modules/reverie-fonts'
import { useColors, useStyles, type Colors } from '@/theme'

const FIELD_HEIGHT = 48

const FALLBACK_FAMILIES =
  Platform.OS === 'android'
    ? ['serif', 'sans-serif', 'sans-serif-light', 'sans-serif-condensed', 'serif-monospace', 'monospace', 'casual', 'cursive']
    : ['Georgia', 'Palatino', 'Iowan Old Style', 'Charter', 'Avenir Next', 'Times New Roman', 'Helvetica Neue', 'Menlo']

// Rounded to a percent, and caught by the regular size when the slider passes near it.
function snap(value: number) {
  const { default: normal } = CHAT_TEXT_SCALE_RANGE
  return Math.abs(value - normal) < 0.025 ? normal : Math.round(value * 100) / 100
}

export default function ChatTextScreen() {
  const padding = useScreenPadding('form')
  const colors = useColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { font, scale, setFont, setScale, reset } = useChatTextSettings()
  const untouched = font === DEFAULT_CHAT_FONT && scale === CHAT_TEXT_SCALE_RANGE.default
  const fontFamily = font
  const scaled = (value: number) => value * scale

  // Everything installed, the system font first. Without the native module (Expo Go,
  // and Android always) a few that every device has.
  const families = useMemo(() => {
    const installed = installedFontFamilies()
    return [SYSTEM_FONT, ...(installed.length ? installed : FALLBACK_FAMILIES)]
  }, [])
  const items = useMemo<MenuItem[]>(
    () =>
      families.map((family) => ({
        label: family === SYSTEM_FONT ? t('chatFont.system') : family,
        systemImage: family === font ? 'checkmark' : undefined,
        onSelect: () => setFont(family),
      })),
    [families, font, setFont, t]
  )

  const bot = {
    color: colors.text,
    letterSpacing: 0.1,
    fontFamily,
    fontSize: scaled(CHAT_METRICS.bot.size),
    lineHeight: scaled(CHAT_METRICS.bot.line),
  }

  return (
    <View style={styles.screen}>
      <View style={padding}>
        {/* A made-up exchange, so a change shows at once as it will look in a chat. */}
        <View style={styles.card}>
          <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
            <View style={styles.bubble}>
              <Text
                style={{
                  color: colors.text,
                  fontFamily,
                  fontSize: scaled(CHAT_METRICS.user.size),
                  lineHeight: scaled(CHAT_METRICS.user.line),
                }}
              >
                {t('chatPreview.user')}
              </Text>
            </View>
            <Markdown text={t('chatPreview.reply')} style={bot} emStyle={styles.action} />
          </ScrollView>
          <View style={styles.composer}>
            <GlassSurface interactive style={[glass.circle, styles.circle]} fallbackStyle={glass.solid}>
              <Ionicons name="add" size={24} color={colors.text} />
            </GlassSurface>
            <GlassSurface interactive style={styles.field} fallbackStyle={glass.solid}>
              <Text style={styles.placeholder} numberOfLines={1}>
                {t('chat.messagePlaceholder')}
              </Text>
              <View style={styles.send}>
                <Ionicons name="arrow-up" size={18} color={colors.textFaint} />
              </View>
            </GlassSurface>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.small}>A</Text>
          <Slider
            value={scale}
            minimumValue={CHAT_TEXT_SCALE_RANGE.min}
            maximumValue={CHAT_TEXT_SCALE_RANGE.max}
            onValueChange={(v) => setScale(snap(v), false)}
            onSlidingComplete={(v) => setScale(snap(v))}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.borderStrong}
            thumbTintColor="#FFFFFF"
            accessibilityLabel={t('settings.chatTextSize')}
            style={styles.slider}
          />
          <Text style={styles.large}>A</Text>
        </View>

        <FieldRow
          star={false}
          label={t('settings.chatFont')}
          value={font === SYSTEM_FONT ? t('chatFont.system') : font}
          menu={items}
        />

        <PillButton label={t('settings.chatReset')} onPress={reset} disabled={untouched} style={styles.reset} />

        <Text style={styles.hint}>{t('settings.chatTextHint')}</Text>
      </View>
      <FormScreenHeader title={t('settings.chatFont')} />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    card: {
      borderRadius: 32,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 12,
    },
    // A set height, so the card does not grow with the text: what does not fit scrolls.
    messages: { height: 200, marginBottom: 12 },
    messagesContent: { gap: 16 },
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
    panel: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
      paddingHorizontal: 20,
      height: 64,
      borderRadius: 32,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
    },
    small: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    large: { color: colors.textMuted, fontSize: 24, fontWeight: '600' },
    slider: { flex: 1, height: 40, marginHorizontal: 12 },
    reset: { alignSelf: 'center', marginTop: 8 },
    hint: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 12, paddingHorizontal: 8 },
  })
