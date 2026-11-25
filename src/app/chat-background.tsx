import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { ChatBackground } from '@/components/chat/ChatBackground'
import { ChatPreview, PREVIEW_HEIGHT } from '@/components/chat/ChatPreview'
import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { ButtonCell, ListSection, SwitchCell } from '@/components/lists/GroupedList'
import { nativeForm, NativeForm, NativeHostedRow, NativeSection } from '@/components/lists/NativeForm'
import { SourceCell } from '@/components/lists/PictureCells'
import { Icon } from '@/components/visuals/Icon'
import { SFIcon } from '@/components/visuals/SFIcon'
import { NO_PICTURE, useChatScheme } from '@/components/chrome/ChatChrome'
import { ImageSourceMenu } from '@/components/overlays/ImageSourceMenu'
import { listCharacterGalleries, type CharacterGallery, type GalleryItem } from '@/db/gallery'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { isAndroid } from '@/lib/core/platform'
import {
  avatarUri,
  checkBackground,
  cropFromJson,
  cropToJson,
  persistAvatar,
  persistOriginal,
  pickBackground,
  removeAvatar,
  type CropRect,
} from '@/lib/images/avatars'
import { setBackgroundDraft } from '@/lib/images/backgroundDraft'
import { galleryUri } from '@/lib/images/gallery'
import { setGalleryPick } from '@/lib/images/galleryPick'
import { movingKind } from '@/lib/images/media'
import type { ImageSource } from '@/lib/images/images'
import { alertError } from '@/lib/transfer/report'
import * as Haptics from '@/lib/ui/haptics'
import { type Colors, CONTROL_FONT_SCALE, FILL, ON_ACCENT, SchemeOverride, useColors, useStyles } from '@/theme'

const TILE_WIDTH = 96
const TILE_HEIGHT = (TILE_WIDTH * 852) / 393
const MARK_SIZE = 22
const TILE_LABEL_LINE = 16

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

export default function ChatBackgroundScreen() {
  const router = useRouter()
  const db = useDatabase()
  const padding = useScreenPadding('form')
  const { fontScale } = useWindowDimensions()
  const tilesHeight = 32 + TILE_HEIGHT + 6 + Math.ceil(TILE_LABEL_LINE * Math.min(fontScale, CONTROL_FONT_SCALE)) + 6 + MARK_SIZE + 2
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [galleries, setGalleries] = useState<CharacterGallery[]>([])
  useFocusEffect(
    useCallback(() => {
      listCharacterGalleries(db)
        .then(setGalleries)
        .catch((err) => console.warn('Gallery not loaded', err))
    }, [db])
  )
  const {
    pattern,
    setPattern,
    wallpaper,
    setWallpaper,
    backdrop,
    setBackdrop,
    homeBackground,
    setHomeBackground,
    bubbleGlass,
    setBubbleGlass,
  } = useChatTextSettings()

  const wallpaperUri = wallpaper?.file ? avatarUri(wallpaper.file, 'backgrounds') : null
  const noPicture = pattern !== 'custom' || !wallpaper?.file
  const previewScheme = useChatScheme(NO_PICTURE)

  const openBackground = (uri: string, crop: CropRect | null, original: string | null) => {
    setBackgroundDraft({
      uri,
      crop,
      characterName: t('settings.chatPattern'),
      effect: wallpaper?.effect ?? 'blur',
      intensity: wallpaper?.intensity ?? 0.5,
      bubbleTransparency: wallpaper?.bubbleTransparency ?? 0.3,
      bubbleGlass: wallpaper?.bubbleGlass ?? bubbleGlass,
      tone: wallpaper?.tone ?? 'auto',
      onDone: async (result) => {
        try {
          const moving = movingKind(result.uri) !== null
          const file = moving && wallpaper?.file && result.uri === wallpaperUri ? wallpaper.file : await persistAvatar(result.uri, 'backgrounds')
          const originalFile = moving ? null : original ? await persistOriginal(original, 'backgrounds') : (wallpaper?.original ?? null)
          const oldFile = wallpaper?.file
          const oldOriginal = wallpaper?.original
          const nextGlass = result.bubbleGlass ?? false
          const nextWallpaper = {
            file,
            original: originalFile,
            crop: cropToJson(result.crop),
            effect: result.effect,
            intensity: result.intensity,
            bubbleTransparency: result.bubbleTransparency,
            bubbleGlass: nextGlass,
            tone: result.tone,
          }
          setWallpaper(nextWallpaper)
          setPattern('custom')
          setBubbleGlass(nextGlass)
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

  const onBackgroundFromGallery = (item: GalleryItem) => {
    try {
      const uri = galleryUri(item.file)
      checkBackground(uri)
      openBackground(uri, null, uri)
    } catch (err) {
      alertError(t('background.failedTitle'), err)
    }
  }

  const openGallery = () => {
    setGalleryPick({
      title: t('gallery.title'),
      sections: galleries.map((g) => ({ name: g.name.trim() || t('editor.characterTitle'), items: g.items })),
      onPick: ([item]) => onBackgroundFromGallery(item),
    })
    router.push('/gallery-pick')
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

  const customTile = (
    <View style={styles.tileButton}>
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
    </View>
  )

  const tiles = (
    <View style={styles.tiles}>
      <Pressable
        onPress={() => {
          if (pattern !== 'none') {
            Haptics.selectionAsync()
            setPattern('none')
          }
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: pattern === 'none' }}
        accessibilityLabel={t('chatPattern.none')}
        style={styles.tileButton}
      >
        <View style={styles.tile}>
          <View style={[styles.edge, styles.tileEdge]} pointerEvents="none" />
        </View>
        <Text style={styles.tileLabel} numberOfLines={1}>
          {t('chatPattern.none')}
        </Text>
        <ChoiceMark selected={pattern === 'none'} />
      </Pressable>
      {wallpaper?.file ? (
        <Pressable
          onPress={() => {
            if (pattern !== 'custom') {
              Haptics.selectionAsync()
              setPattern('custom')
            } else {
              onAdjustBackground()
            }
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: pattern === 'custom' }}
          accessibilityLabel={t('chatPattern.custom')}
        >
          {customTile}
        </Pressable>
      ) : (
        <ImageSourceMenu
          onPick={onPickBackground}
          onGallery={galleries.length > 0 ? openGallery : undefined}
          galleryLabel={t('gallery.pickFromCharacters')}
        >
          <View accessible accessibilityRole="button" accessibilityLabel={t('chatPattern.custom')}>
            {customTile}
          </View>
        </ImageSourceMenu>
      )}
    </View>
  )

  const sourceCell = (
    <SourceCell
      label={wallpaper?.file ? t('background.change') : t('background.choose')}
      onPick={onPickBackground}
      onGallery={galleries.length > 0 ? openGallery : undefined}
      galleryLabel={t('gallery.pickFromCharacters')}
    />
  )

  const renderNative = ({ ui }: NonNullable<typeof nativeForm>) => {
    const { Toggle, Button: SwiftButton } = ui
    return (
      <NativeForm>
        <NativeSection>
          <NativeHostedRow height={PREVIEW_HEIGHT} clear>
            <SchemeOverride scheme={previewScheme}>
              <ChatPreview flush />
            </SchemeOverride>
          </NativeHostedRow>
        </NativeSection>

        {/* Keep the hosted tiles and source picker in a section whose rows and footer never change,
            so switching None/Custom does not rebuild the Section and blank out its RNHostViews. */}
        <NativeSection title={t('settings.backgroundScreen')}>
          <NativeHostedRow height={tilesHeight}>{tiles}</NativeHostedRow>
          <NativeHostedRow>{sourceCell}</NativeHostedRow>
        </NativeSection>

        {wallpaper?.file ? (
          <NativeSection>
            <SwiftButton label={t('background.adjust')} onPress={onAdjustBackground} />
            <SwiftButton label={t('background.remove')} role="destructive" onPress={onRemoveBackground} />
          </NativeSection>
        ) : null}

        {!noPicture ? (
          <NativeSection footer={t('settings.chatBackdropHint')}>
            <Toggle label={t('settings.chatBackdrop')} isOn={backdrop} onIsOnChange={setBackdrop} />
            <Toggle label={t('settings.homeBackground')} isOn={homeBackground} onIsOnChange={setHomeBackground} />
          </NativeSection>
        ) : null}
      </NativeForm>
    )
  }

  return (
    <View style={styles.screen}>
      {nativeForm ? (
        renderNative(nativeForm)
      ) : (
        <ScrollView contentContainerStyle={padding}>
          <SchemeOverride scheme={previewScheme}>
            <ChatPreview />
          </SchemeOverride>

          <ListSection header={t('settings.backgroundScreen')}>
            {tiles}
            {sourceCell}
          </ListSection>

          {wallpaper?.file ? (
            <ListSection>
              <ButtonCell label={t('background.adjust')} onPress={onAdjustBackground} />
              <ButtonCell danger label={t('background.remove')} onPress={onRemoveBackground} />
            </ListSection>
          ) : null}

          {!noPicture ? (
            <ListSection footer={t('settings.chatBackdropHint')}>
              <SwitchCell label={t('settings.chatBackdrop')} value={backdrop} onValueChange={setBackdrop} />
              <SwitchCell label={t('settings.homeBackground')} value={homeBackground} onValueChange={setHomeBackground} />
            </ListSection>
          ) : null}
        </ScrollView>
      )}
      {isAndroid ? (
        <GlassHeader
          floating
          centerTitle
          left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />}
        >
          <TabTitle star={false}>{t('settings.backgroundScreen')}</TabTitle>
        </GlassHeader>
      ) : (
        <FormScreenHeader title={t('settings.backgroundScreen')} />
      )}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    tiles: { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 28, padding: 16 },
    tileButton: { width: TILE_WIDTH, alignItems: 'center', gap: 6 },
    tile: {
      width: TILE_WIDTH,
      height: TILE_HEIGHT,
      borderRadius: 14,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.bg,
    },
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
    tileLabel: { color: colors.text, fontSize: 13, lineHeight: TILE_LABEL_LINE, textAlign: 'center' },
  })
