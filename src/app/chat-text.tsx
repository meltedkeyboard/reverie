import { Icon } from '@/components/visuals/Icon'
import { SFIcon } from '@/components/visuals/SFIcon'
import Slider from '@react-native-community/slider'
import { useRouter } from 'expo-router'
import { useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { ChatBackground } from '@/components/chat/ChatBackground'
import { Pattern } from '@/components/visuals/Pattern'
import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { ButtonCell, ListSection, MenuCell, SwitchCell } from '@/components/lists/GroupedList'
import { SourceCell } from '@/components/lists/PictureCells'
import { useScreenPadding } from '@/components/chrome/GlassHeader'
import { Markdown } from '@/components/chat/Markdown'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { CHAT_PATTERNS, CHAT_TEXT_SCALE_RANGE, DEFAULT_CHAT_FONT, SYSTEM_FONT } from '@/db/prefs/settings'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { CHAT_METRICS, useChatTextSettings } from '@/lib/chat/chatText'
import { withAlpha } from '@/lib/core/color'
import { isAndroid, isWeb } from '@/lib/core/platform'
import {
  avatarUri,
  cropFromJson,
  cropToJson,
  persistAvatar,
  persistOriginal,
  pickBackground,
  removeAvatar,
  type CropRect,
} from '@/lib/images/avatars'
import { setBackgroundDraft } from '@/lib/images/backgroundDraft'
import type { ImageSource } from '@/lib/images/images'
import { alertError } from '@/lib/transfer/report'
import * as Haptics from '@/lib/ui/haptics'
import { installedFontFamilies } from '../../modules/reverie-fonts'
import { type Colors, ON_ACCENT, paletteOf, type ThemePreference, useColors, useStyles, useTheme } from '@/theme'

const FIELD_HEIGHT = 48
// A tile shows a whole 393 x 852 board, small.
const TILE_WIDTH = 84
const TILE_BORDER = 2
const TILE_INNER = TILE_WIDTH - TILE_BORDER * 2
const TILE_HEIGHT = (TILE_INNER * 852) / 393 + TILE_BORDER * 2

const FALLBACK_FAMILIES =
  isAndroid
    ? ['serif', 'sans-serif', 'sans-serif-light', 'sans-serif-condensed', 'serif-monospace', 'monospace', 'casual', 'cursive']
    : ['Georgia', 'Palatino', 'Iowan Old Style', 'Charter', 'Avenir Next', 'Times New Roman', 'Helvetica Neue', 'Menlo']

// Rounded to a percent, and caught by the regular size when the slider passes near it.
function snap(value: number) {
  const { default: normal } = CHAT_TEXT_SCALE_RANGE
  return Math.abs(value - normal) < 0.025 ? normal : Math.round(value * 100) / 100
}

const THEME_TILE_WIDTH = 80
const THEME_TILE_HEIGHT = 104

function ThemePreviewTile({ value, selected }: { value: ThemePreference; selected: boolean }) {
  const colors = useColors()
  const styles = useStyles(createStyles)

  if (value === 'system') {
    const light = paletteOf('light')
    const dark = paletteOf('dark')
    return (
      <View style={[styles.themeTile, selected && styles.themeTileSelected]}>
        <View style={styles.splitRow}>
          <View style={[styles.splitHalf, { backgroundColor: light.bg }]}>
            <View style={[styles.miniHeader, { backgroundColor: light.surface, borderBottomColor: light.border }]}>
              <View style={[styles.miniAvatar, { backgroundColor: light.accent }]} />
              <View style={[styles.miniBar, { backgroundColor: light.textMuted, width: 14 }]} />
            </View>
            <View style={styles.miniChatHalf}>
              <View style={[styles.miniBubbleLeft, { backgroundColor: light.surfaceRaised }]}>
                <View style={[styles.miniLine, { backgroundColor: light.textMuted, width: 18 }]} />
              </View>
            </View>
          </View>
          <View style={[styles.splitHalf, { backgroundColor: dark.bg }]}>
            <View style={[styles.miniHeader, { backgroundColor: dark.surface, borderBottomColor: dark.border }]}>
              <View style={[styles.miniAvatar, { backgroundColor: dark.accent }]} />
              <View style={[styles.miniBar, { backgroundColor: dark.textMuted, width: 14 }]} />
            </View>
            <View style={styles.miniChatHalf}>
              <View style={[styles.miniBubbleRight, { backgroundColor: dark.bubble }]}>
                <View style={[styles.miniLine, { backgroundColor: dark.text, width: 16 }]} />
              </View>
            </View>
          </View>
        </View>
        <View style={styles.splitCenterBadge}>
          <Icon name="contrast" size={12} color={colors.text} />
        </View>
      </View>
    )
  }

  const p = paletteOf(value)
  return (
    <View style={[styles.themeTile, selected && styles.themeTileSelected, { backgroundColor: p.bg }]}>
      <View style={[styles.miniHeader, { backgroundColor: p.surface, borderBottomColor: p.border }]}>
        <View style={[styles.miniAvatar, { backgroundColor: p.accent }]} />
        <View style={[styles.miniBar, { backgroundColor: p.textMuted, width: 22 }]} />
      </View>
      <View style={styles.miniChat}>
        <View style={[styles.miniBubbleLeft, { backgroundColor: p.surfaceRaised }]}>
          <View style={[styles.miniLine, { backgroundColor: p.textMuted, width: 28 }]} />
          <View style={[styles.miniLine, { backgroundColor: p.textFaint, width: 16 }]} />
        </View>
        <View style={[styles.miniBubbleRight, { backgroundColor: p.bubble }]}>
          <View style={[styles.miniLine, { backgroundColor: p.text, width: 22 }]} />
        </View>
      </View>
      <View style={[styles.miniComposer, { backgroundColor: p.surface, borderTopColor: p.border }]}>
        <View style={[styles.miniField, { backgroundColor: p.surfaceRaised }]} />
        <View style={[styles.miniSend, { backgroundColor: p.accent }]} />
      </View>
    </View>
  )
}

export default function ChatTextScreen() {
  const router = useRouter()
  const db = useDatabase()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { preference, setPreference } = useTheme()
  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('theme.system') },
    { value: 'light', label: t('theme.light') },
    { value: 'warm', label: t('theme.warm') },
    { value: 'dark', label: t('theme.dark') },
    { value: 'warm-dark', label: t('theme.warm-dark') },
    { value: 'black', label: t('theme.black') },
    { value: 'grey', label: t('theme.grey') },
  ]
  const {
    font,
    userFont,
    setUserFont,
    userMarkdown,
    setUserMarkdown,
    pattern,
    setPattern,
    wallpaper,
    setWallpaper,
    scale,
    setFont,
    setScale,
    reset,
  } = useChatTextSettings()

  const wallpaperUri = wallpaper?.file ? avatarUri(wallpaper.file, 'backgrounds') : null

  const openBackground = (uri: string, crop: CropRect | null, original: string | null) => {
    setBackgroundDraft({
      uri,
      crop,
      characterName: t('settings.chatPattern'),
      effect: wallpaper?.effect ?? 'blur',
      intensity: wallpaper?.intensity ?? 0.5,
      bubbleTransparency: wallpaper?.bubbleTransparency ?? 0.3,
      onDone: async (result) => {
        try {
          const file = await persistAvatar(result.uri, 'backgrounds')
          const originalFile = original ? await persistOriginal(original, 'backgrounds') : (wallpaper?.original ?? null)
          const oldFile = wallpaper?.file
          const oldOriginal = wallpaper?.original
          const nextWallpaper = {
            file,
            original: originalFile,
            crop: cropToJson(result.crop),
            effect: result.effect,
            intensity: result.intensity,
            bubbleTransparency: result.bubbleTransparency,
          }
          setWallpaper(nextWallpaper)
          setPattern('custom')
          if (oldFile && oldFile !== file) removeAvatar(oldFile, 'backgrounds')
          if (oldOriginal && oldOriginal !== originalFile && (!original || oldOriginal !== original)) {
            removeAvatar(oldOriginal, 'backgrounds')
          }
        } catch (err) {
          alertError(t('background.failedTitle'), err)
        }
      },
    })
    router.push('/background')
  }

  const onPickBackground = async (source: ImageSource) => {
    try {
      const uri = await pickBackground(source)
      if (uri) openBackground(uri, null, uri)
    } catch (err) {
      alertError(t('background.failedTitle'), err)
    }
  }

  const onAdjustBackground = () => {
    if (!wallpaper?.file) return
    const originalUri = wallpaper.original ? avatarUri(wallpaper.original, 'backgrounds') : null
    const fileUri = avatarUri(wallpaper.file, 'backgrounds')
    const uri = originalUri ?? fileUri
    if (!uri) return
    openBackground(uri, cropFromJson(wallpaper.crop), originalUri ? null : uri)
  }

  const onRemoveBackground = async () => {
    if (wallpaper?.file) removeAvatar(wallpaper.file, 'backgrounds')
    if (wallpaper?.original) removeAvatar(wallpaper.original, 'backgrounds')
    setWallpaper(null)
    if (pattern === 'custom') setPattern('none')
  }

  const resetSize = () => {
    Haptics.selectionAsync()
    setScale(CHAT_TEXT_SCALE_RANGE.default)
  }
  const untouched = font === DEFAULT_CHAT_FONT && !userFont && scale === CHAT_TEXT_SCALE_RANGE.default
  const fontFamily = font
  const scaled = (value: number) => value * scale
  // The regular size is felt, not drawn: the thumb clicks as it reaches it.
  const atNormal = useRef(scale === CHAT_TEXT_SCALE_RANGE.default)
  const drag = (value: number) => {
    const next = snap(value)
    const onNormal = next === CHAT_TEXT_SCALE_RANGE.default
    if (onNormal && !atNormal.current) Haptics.selectionAsync()
    atNormal.current = onNormal
    setScale(next, false)
  }

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

  const user = {
    color: colors.text,
    fontFamily: userFont ? fontFamily : undefined,
    fontSize: scaled(CHAT_METRICS.user.size),
    lineHeight: scaled(CHAT_METRICS.user.line),
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={padding}>
        <ListSection header={t('settings.theme')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeTiles}>
            {themeOptions.map((o) => {
              const selected = preference === o.value
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    if (!selected) Haptics.selectionAsync()
                    setPreference(o.value)
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={o.label}
                  style={styles.themeTileButton}
                >
                  <ThemePreviewTile value={o.value} selected={selected} />
                  <Text style={[styles.themeLabel, selected && styles.themeLabelSelected, selected && { color: colors.text }]} numberOfLines={2}>
                    {o.label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </ListSection>

        {/* A made-up exchange, so a change shows at once as it will look in a chat. */}
        <View style={styles.card}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {pattern === 'custom' && wallpaperUri ? (
              <ChatBackground
                uri={wallpaperUri}
                effect={wallpaper?.effect ?? 'blur'}
                intensity={wallpaper?.intensity ?? 0.5}
              />
            ) : (
              <Pattern id={pattern} />
            )}
          </View>
          <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
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

        <ListSection>
          <View style={styles.sizeRow}>
            <Text style={styles.small}>A</Text>
            <Slider
              value={scale}
              minimumValue={CHAT_TEXT_SCALE_RANGE.min}
              maximumValue={CHAT_TEXT_SCALE_RANGE.max}
              onValueChange={drag}
              onSlidingComplete={(v) => setScale(snap(v))}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.borderStrong}
              thumbTintColor={ON_ACCENT}
              accessibilityLabel={t('settings.chatTextSize')}
              style={styles.slider}
            />
            <Text style={styles.large}>A</Text>
            {/* Only the size back to the default; the button below resets everything. */}
            <Pressable
              onPress={resetSize}
              disabled={scale === CHAT_TEXT_SCALE_RANGE.default}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('settings.chatResetSize')}
              style={({ pressed }) => [styles.sizeReset, pressed && { opacity: 0.5 }]}
            >
              <SFIcon
                name="arrow.counterclockwise"
                fallback="refresh"
                size={20}
                color={scale === CHAT_TEXT_SCALE_RANGE.default ? colors.textFaint : colors.accent}
              />
            </Pressable>
          </View>
          <MenuCell label={t('settings.chatFontField')} value={font === SYSTEM_FONT ? t('chatFont.system') : font} items={items} />
          <SwitchCell label={t('settings.chatUserFont')} value={userFont} onValueChange={setUserFont} />
          <SwitchCell label={t('settings.chatUserMarkdown')} value={userMarkdown} onValueChange={setUserMarkdown} />
        </ListSection>

        <ListSection header={t('settings.chatPattern')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
            <Pressable
              onPress={() => {
                if (wallpaper?.file) {
                  if (pattern !== 'custom') {
                    Haptics.selectionAsync()
                    setPattern('custom')
                  } else {
                    onAdjustBackground()
                  }
                } else {
                  onPickBackground(isWeb ? 'files' : 'library')
                }
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: pattern === 'custom' }}
              accessibilityLabel={t('chatPattern.custom')}
              style={styles.tileButton}
            >
              <View style={[styles.tile, pattern === 'custom' && styles.tileSelected]}>
                {wallpaperUri ? (
                  <ChatBackground
                    uri={wallpaperUri}
                    effect={wallpaper?.effect ?? 'blur'}
                    intensity={wallpaper?.intensity ?? 0.5}
                  />
                ) : (
                  <View style={styles.customTileEmpty}>
                    <Icon name="add" size={24} color={colors.textFaint} />
                  </View>
                )}
              </View>
              <Text style={[styles.tileLabel, pattern === 'custom' && { color: colors.text }]} numberOfLines={1}>
                {t('chatPattern.custom')}
              </Text>
            </Pressable>
            {CHAT_PATTERNS.map((id) => {
              const selected = id === pattern
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    if (!selected) Haptics.selectionAsync()
                    setPattern(id)
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(`chatPattern.${id}`)}
                  style={styles.tileButton}
                >
                  <View style={[styles.tile, selected && styles.tileSelected]}>
                    <Pattern id={id} scale={TILE_INNER / 393} />
                  </View>
                  <Text style={[styles.tileLabel, selected && { color: colors.text }]} numberOfLines={1}>
                    {t(`chatPattern.${id}`)}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
          <SourceCell label={wallpaper?.file ? t('background.change') : t('background.choose')} onPick={onPickBackground} />
          {wallpaper?.file ? <ButtonCell label={t('background.adjust')} onPress={onAdjustBackground} /> : null}
          {wallpaper?.file ? <ButtonCell danger label={t('background.remove')} onPress={onRemoveBackground} /> : null}
        </ListSection>

        <ListSection>
          <ButtonCell label={t('settings.chatReset')} onPress={reset} disabled={untouched} />
        </ListSection>
      </ScrollView>
      <FormScreenHeader title={t('settings.chatFont')} />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    // A set height, so the card does not grow with the text: what does not fit scrolls.
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
    sizeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56 },
    small: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    large: { color: colors.textMuted, fontSize: 24, fontWeight: '600' },
    slider: { flex: 1, height: 40, marginHorizontal: 12 },
    sizeReset: { marginLeft: 14 },
    tiles: { gap: 12, padding: 16 },
    tileButton: { width: TILE_WIDTH, alignItems: 'center', gap: 6 },
    tile: {
      width: TILE_WIDTH,
      height: TILE_HEIGHT,
      borderRadius: 14,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.bg,
      borderWidth: TILE_BORDER,
      borderColor: colors.border,
    },
    tileSelected: { borderColor: colors.accent },
    customTileEmpty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileLabel: { color: colors.textMuted, fontSize: 12 },
    themeTiles: { gap: 12, padding: 16 },
    themeTileButton: { width: THEME_TILE_WIDTH, alignItems: 'center', gap: 8 },
    themeTile: {
      width: THEME_TILE_WIDTH,
      height: THEME_TILE_HEIGHT,
      borderRadius: 14,
      borderCurve: 'continuous',
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: colors.border,
    },
    themeTileSelected: {
      borderColor: colors.accent,
    },
    themeLabel: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
      minHeight: 28,
    },
    themeLabelSelected: {
      fontWeight: '600',
    },
    miniHeader: {
      height: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3.5,
      paddingHorizontal: 5,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    miniAvatar: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    miniBar: {
      height: 2.5,
      borderRadius: 1.25,
    },
    miniChat: {
      flex: 1,
      padding: 5,
      justifyContent: 'center',
      gap: 5,
    },
    miniChatHalf: {
      flex: 1,
      padding: 4,
      justifyContent: 'center',
    },
    miniBubbleLeft: {
      alignSelf: 'flex-start',
      borderRadius: 5,
      paddingHorizontal: 4,
      paddingVertical: 3,
      gap: 2,
      maxWidth: 50,
    },
    miniBubbleRight: {
      alignSelf: 'flex-end',
      borderRadius: 5,
      paddingHorizontal: 4,
      paddingVertical: 3,
      maxWidth: 44,
    },
    miniLine: {
      height: 2,
      borderRadius: 1,
    },
    miniComposer: {
      height: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    miniField: {
      flex: 1,
      height: 7,
      borderRadius: 3.5,
    },
    miniSend: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    splitRow: {
      flex: 1,
      flexDirection: 'row',
    },
    splitHalf: {
      flex: 1,
      overflow: 'hidden',
    },
    splitCenterBadge: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: [{ translateX: -10 }, { translateY: -10 }],
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
  })
