import { Icon } from '@/components/visuals/Icon'
import { SFIcon } from '@/components/visuals/SFIcon'
import Slider from '@react-native-community/slider'
import { useRouter } from 'expo-router'
import { useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { ChatBackground } from '@/components/chat/ChatBackground'
import { Pattern } from '@/components/visuals/Pattern'
import { useChatScheme, type ChatLook } from '@/components/chrome/ChatChrome'
import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { ButtonCell, CheckCell, ListSection, MenuCell, SwitchCell } from '@/components/lists/GroupedList'
import { Segmented } from '@/components/controls/Segmented'
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
import { movingKind } from '@/lib/images/media'
import type { ImageSource } from '@/lib/images/images'
import { alertError } from '@/lib/transfer/report'
import * as Haptics from '@/lib/ui/haptics'
import { installedFontFamilies } from '../../modules/reverie-fonts'
import { type Colors, FILL, ON_ACCENT, paletteOf, SchemeOverride, THEMES, type ThemeMode, type ThemeName, useColors, useStyles, useTheme } from '@/theme'

const FIELD_HEIGHT = 48
// A tile shows a whole 393 x 852 board, small.
const TILE_WIDTH = 84
const TILE_HEIGHT = (TILE_WIDTH * 852) / 393
const MARK_SIZE = 22

const FALLBACK_FAMILIES =
  isAndroid
    ? ['serif', 'sans-serif', 'sans-serif-light', 'sans-serif-condensed', 'serif-monospace', 'monospace', 'casual', 'cursive']
    : ['Georgia', 'Palatino', 'Iowan Old Style', 'Charter', 'Avenir Next', 'Times New Roman', 'Helvetica Neue', 'Menlo']

// Rounded to a percent, and caught by the regular size when the slider passes near it.
function snap(value: number) {
  const { default: normal } = CHAT_TEXT_SCALE_RANGE
  return Math.abs(value - normal) < 0.025 ? normal : Math.round(value * 100) / 100
}

// A theme's icon in its row, as the colored squares of the Settings rows: its background
// with the accent in the middle, in the scheme in effect, so the mode under the rows
// repaints them all at once.
function ThemeIcon({ theme }: { theme: ThemeName }) {
  const styles = useStyles(createStyles)
  const { scheme } = useTheme()
  const palette = paletteOf(theme, scheme)
  return (
    <View style={[styles.themeIcon, { backgroundColor: palette.bg }]}>
      <View style={[styles.themeIconDot, { backgroundColor: palette.accent }]} />
      <View style={[styles.edge, styles.themeIconEdge]} pointerEvents="none" />
    </View>
  )
}

// The choice under a tile, as under the Light and Dark previews of the system's Display
// settings: an empty circle, filled with the accent and checked once it is the one chosen.
// The tile itself is never outlined.
function ChoiceMark({ selected }: { selected: boolean }) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.mark}>
      {selected ? (
        <View style={styles.markOn}>
          <SFIcon name="checkmark" fallback="checkmark" size={12} color={ON_ACCENT} onAccent />
        </View>
      ) : null}
    </View>
  )
}

// A chat with no picture of its own: what it shows is the wallpaper or the pattern.
const NO_PICTURE: ChatLook = {
  background: null,
  backgroundCrop: null,
  backgroundEffect: 'blur',
  backgroundIntensity: 0.5,
  backgroundBubbleTransparency: 0.3,
  backgroundTone: 'auto',
}

// The preview card, a component of its own so that it reads the colors of the scheme set
// around it.
function ChatPreview() {
  const colors = useColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { font, userFont, userMarkdown, pattern, wallpaper, scale } = useChatTextSettings()
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

  return (
    <View style={styles.card}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {pattern === 'custom' && wallpaperUri ? (
          <ChatBackground
            uri={wallpaperUri}
            crop={cropFromJson(wallpaper?.crop ?? null)}
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
  const { theme, setTheme, mode, setMode } = useTheme()
  const modeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: t('theme.system') },
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
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
    backdrop,
    setBackdrop,
    scale,
    setFont,
    setScale,
    reset,
  } = useChatTextSettings()

  const wallpaperUri = wallpaper?.file ? avatarUri(wallpaper.file, 'backgrounds') : null
  const previewScheme = useChatScheme(NO_PICTURE)

  const openBackground = (uri: string, crop: CropRect | null, original: string | null) => {
    setBackgroundDraft({
      uri,
      crop,
      characterName: t('settings.chatPattern'),
      effect: wallpaper?.effect ?? 'blur',
      intensity: wallpaper?.intensity ?? 0.5,
      bubbleTransparency: wallpaper?.bubbleTransparency ?? 0.3,
      tone: wallpaper?.tone ?? 'auto',
      onDone: async (result) => {
        try {
          // A moving picture comes back as it went and is its own original; given only a
          // new frame, it is the stored file itself, not copied again.
          const moving = movingKind(result.uri) !== null
          const file = moving && wallpaper?.file && result.uri === wallpaperUri ? wallpaper.file : await persistAvatar(result.uri, 'backgrounds')
          const originalFile = moving ? null : original ? await persistOriginal(original, 'backgrounds') : (wallpaper?.original ?? null)
          const oldFile = wallpaper?.file
          const oldOriginal = wallpaper?.original
          const nextWallpaper = {
            file,
            original: originalFile,
            crop: cropToJson(result.crop),
            effect: result.effect,
            intensity: result.intensity,
            bubbleTransparency: result.bubbleTransparency,
            tone: result.tone,
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

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={padding}>
        <ListSection header={t('settings.theme')}>
          {THEMES.map((name) => (
            <CheckCell
              key={name}
              label={t(`theme.${name}`)}
              checked={theme === name}
              onPress={() => setTheme(name)}
              leading={<ThemeIcon theme={name} />}
            />
          ))}
          <View style={styles.themeMode}>
            <Segmented options={modeOptions} value={mode} onChange={setMode} />
          </View>
        </ListSection>

        {/* A made-up exchange, so a change shows at once as it will look in a chat, in the
            scheme the chat takes over the wallpaper. */}
        <SchemeOverride scheme={previewScheme}>
          <ChatPreview />
        </SchemeOverride>

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

        <ListSection header={t('settings.chatPattern')} footer={t('settings.chatBackdropHint')}>
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
              <View style={styles.tile}>
                {wallpaperUri ? (
                  <ChatBackground
                    uri={wallpaperUri}
                    crop={cropFromJson(wallpaper?.crop ?? null)}
                    effect={wallpaper?.effect ?? 'blur'}
                    intensity={wallpaper?.intensity ?? 0.5}
                  />
                ) : (
                  <View style={styles.customTileEmpty}>
                    <Icon name="add" size={24} color={colors.textFaint} />
                  </View>
                )}
                <View style={[styles.edge, styles.tileEdge]} pointerEvents="none" />
              </View>
              <Text style={styles.tileLabel} numberOfLines={1}>
                {t('chatPattern.custom')}
              </Text>
              <ChoiceMark selected={pattern === 'custom'} />
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
                  <View style={styles.tile}>
                    <Pattern id={id} scale={TILE_WIDTH / 393} />
                    <View style={[styles.edge, styles.tileEdge]} pointerEvents="none" />
                  </View>
                  <Text style={styles.tileLabel} numberOfLines={1}>
                    {t(`chatPattern.${id}`)}
                  </Text>
                  <ChoiceMark selected={selected} />
                </Pressable>
              )
            })}
          </ScrollView>
          <SourceCell label={wallpaper?.file ? t('background.change') : t('background.choose')} onPick={onPickBackground} />
          {wallpaper?.file ? <ButtonCell label={t('background.adjust')} onPress={onAdjustBackground} /> : null}
          {wallpaper?.file ? <ButtonCell danger label={t('background.remove')} onPress={onRemoveBackground} /> : null}
          <SwitchCell label={t('settings.chatBackdrop')} value={backdrop} onValueChange={setBackdrop} />
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
    },
    // A hairline laid over a preview, so that a light one still has an edge on a light
    // screen without a frame of its own.
    edge: { ...FILL, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderCurve: 'continuous' },
    tileEdge: { borderRadius: 14 },
    mark: {
      width: MARK_SIZE,
      height: MARK_SIZE,
      borderRadius: MARK_SIZE / 2,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      marginTop: 2,
    },
    markOn: {
      position: 'absolute',
      top: -1.5,
      left: -1.5,
      width: MARK_SIZE,
      height: MARK_SIZE,
      borderRadius: MARK_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    customTileEmpty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileLabel: { color: colors.text, fontSize: 13, textAlign: 'center' },
    themeMode: { paddingHorizontal: 16, paddingVertical: 12 },
    themeIcon: { width: 29, height: 29, borderRadius: 7, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
    themeIconDot: { width: 11, height: 11, borderRadius: 5.5 },
    themeIconEdge: { borderRadius: 7 },
  })
