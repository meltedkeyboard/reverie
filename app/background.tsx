import { ImageManipulator } from 'expo-image-manipulator'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '@/components/Button'
import { ChatBackground } from '@/components/ChatBackground'
import { GlassButton, GlassSurface, useGlassStyles } from '@/components/Glass'
import { GlassHeader, HeaderTitle } from '@/components/GlassHeader'
import { ParamSlider } from '@/components/ParamSlider'
import { Segmented } from '@/components/Segmented'
import type { BackgroundEffect } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { frameBackground, type CropRect } from '@/lib/avatars'
import { backgroundDraft } from '@/lib/backgroundDraft'
import { withAlpha } from '@/lib/color'
import { liquidGlass } from '@/lib/nativeUI'
import { type Colors, FILL, useColors, useStyles } from '@/theme'

const MAX_ZOOM = 4

const percent = (value: number) => `${Math.round(value * 100)}%`

// An empty chat with the picture behind it, to try the effect on before it is kept.
export default function BackgroundScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const glass = useGlassStyles()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  // Read once: the draft may be replaced under a screen still closing.
  const [draft] = useState(backgroundDraft)
  const [effect, setEffect] = useState<BackgroundEffect>(draft?.effect ?? 'blur')
  const [intensity, setIntensity] = useState(draft?.intensity ?? 0.5)
  const [bubbleTransparency, setBubbleTransparency] = useState(draft?.bubbleTransparency ?? 0.3)

  const [saving, setSaving] = useState(false)

  // The screen is the frame: the picture covers it, and is moved and zoomed under it.
  // Zoom and offset are kept in screen pixels, the natural size of the picture in its own.
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const zoom = useSharedValue(1)
  const offsetX = useSharedValue(0)
  const offsetY = useSharedValue(0)
  const startZoom = useSharedValue(1)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  // The picture as laid out to cover the frame, before any zoom.
  const coverWidth = useSharedValue(0)
  const coverHeight = useSharedValue(0)
  const frameWidth = useSharedValue(0)
  const frameHeight = useSharedValue(0)

  useEffect(() => {
    if (!draft) return
    ImageManipulator.manipulate(draft.uri)
      .renderAsync()
      .then((picture) => setNatural({ width: picture.width, height: picture.height }))
      .catch(() => {})
  }, [draft])

  useEffect(() => {
    frameWidth.value = frame.width
    frameHeight.value = frame.height
  }, [frame, frameWidth, frameHeight])

  const cover = natural && frame.width ? Math.max(frame.width / natural.width, frame.height / natural.height) : 0
  useEffect(() => {
    if (!natural || !cover) return
    coverWidth.value = natural.width * cover
    coverHeight.value = natural.height * cover
  }, [natural, cover, coverWidth, coverHeight])

  // Framing redone starts from the old frame: the inverse of what `frameRect` computes.
  const placed = useRef(false)
  useEffect(() => {
    if (placed.current || !draft?.crop || !natural || !cover) return
    placed.current = true
    const { originX, originY, width, height } = draft.crop
    const scale = frame.width / width
    const k = Math.min(MAX_ZOOM, Math.max(1, scale / cover))
    const limitX = Math.max(0, (natural.width * cover * k - frame.width) / 2)
    const limitY = Math.max(0, (natural.height * cover * k - frame.height) / 2)
    zoom.value = k
    offsetX.value = Math.min(limitX, Math.max(-limitX, (natural.width / 2 - (originX + width / 2)) * cover * k))
    offsetY.value = Math.min(limitY, Math.max(-limitY, (natural.height / 2 - (originY + height / 2)) * cover * k))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, natural, cover, frame])

  const clampX = (x: number, k: number) => {
    'worklet'
    const limit = Math.max(0, (coverWidth.value * k - frameWidth.value) / 2)
    return Math.min(limit, Math.max(-limit, x))
  }
  const clampY = (y: number, k: number) => {
    'worklet'
    const limit = Math.max(0, (coverHeight.value * k - frameHeight.value) / 2)
    return Math.min(limit, Math.max(-limit, y))
  }

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = offsetX.value
      startY.value = offsetY.value
    })
    .onUpdate((event) => {
      offsetX.value = clampX(startX.value + event.translationX, zoom.value)
      offsetY.value = clampY(startY.value + event.translationY, zoom.value)
    })
    .onEnd(() => {
      offsetX.value = clampX(offsetX.value, zoom.value)
      offsetY.value = clampY(offsetY.value, zoom.value)
    })
  const pinch = Gesture.Pinch()
    .onStart(() => {
      startZoom.value = zoom.value
    })
    .onUpdate((event) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, startZoom.value * event.scale))
      zoom.value = k
      offsetX.value = clampX(offsetX.value, k)
      offsetY.value = clampY(offsetY.value, k)
    })
    .onEnd(() => {
      offsetX.value = clampX(offsetX.value, zoom.value)
      offsetY.value = clampY(offsetY.value, zoom.value)
    })
  const pictureStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }, { scale: zoom.value }],
  }))

  const onLayout = (event: LayoutChangeEvent) => setFrame(event.nativeEvent.layout)

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  // The part of the original the frame shows, so the chat, which covers its screen the
  // same way, shows the same part. Null while the picture is left as it is.
  const frameRect = (): CropRect | null => {
    if (!draft || !natural || !cover) return null
    const k = zoom.value
    if (k === 1 && offsetX.value === 0 && offsetY.value === 0) return null
    const scale = cover * k
    const width = Math.min(natural.width, Math.round(frame.width / scale))
    const height = Math.min(natural.height, Math.round(frame.height / scale))
    const originX = Math.min(natural.width - width, Math.max(0, Math.round(natural.width / 2 - offsetX.value / scale - width / 2)))
    const originY = Math.min(natural.height - height, Math.max(0, Math.round(natural.height / 2 - offsetY.value / scale - height / 2)))
    return { originX, originY, width, height }
  }

  const done = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (draft) {
        const crop = frameRect()
        draft.onDone({ effect, intensity, bubbleTransparency, uri: await frameBackground(draft.uri, crop), crop })
      }
      close()
    } catch {
      setSaving(false)
    }
  }

  if (!draft) return <View style={styles.screen} />

  const options: { value: BackgroundEffect; label: string }[] = [
    { value: 'blur', label: t('background.effectBlur') },
    { value: 'dim', label: t('background.effectDim') },
  ]

  return (
    <View style={styles.screen} onLayout={onLayout}>
      <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
        <Animated.View style={[StyleSheet.absoluteFill, pictureStyle]}>
          <ChatBackground uri={draft.uri} effect={effect} intensity={intensity} />
        </Animated.View>
      </GestureDetector>

      <View style={styles.empty} pointerEvents="none">
        <Text style={styles.emptyName}>{draft.characterName}</Text>
        <Text style={styles.emptyHint}>{t('chat.emptyHint')}</Text>
        <Text style={styles.cropHint}>{t('background.cropHint')}</Text>
      </View>

      {/* A message of the user's, to judge how see-through its bubble is. */}
      <View style={styles.sample} pointerEvents="none">
        <View style={[styles.bubble, { backgroundColor: withAlpha(colors.bubble, 1 - bubbleTransparency) }]}>
          <Text style={styles.bubbleText}>{t('background.sampleMessage')}</Text>
        </View>
      </View>

      <GlassHeader floating left={<GlassButton icon="chevron-back" iconSize={26} onPress={close} />}>
        <HeaderTitle>{t('background.title')}</HeaderTitle>
      </GlassHeader>

      <View style={[styles.dock, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
        {/* Stands in for the composer, so the picture is judged with the real bar on it. */}
        <GlassSurface style={styles.fakeField} fallbackStyle={glass.solid}>
          <Text style={styles.fakePlaceholder}>{t('chat.messagePlaceholder')}</Text>
        </GlassSurface>

        {/* With Liquid Glass each control is its own piece of glass, as glass on glass
            would muddy both; without it they share one solid panel. */}
        <View style={[styles.panel, !liquidGlass && glass.solid]}>
          <Segmented glass options={options} value={effect} onChange={setEffect} />
          <GlassSurface style={styles.slider}>
            <ParamSlider
              label={t('background.intensity')}
              value={intensity}
              min={0}
              max={1}
              step={0.05}
              formatValue={percent}
              onChange={setIntensity}
            />
            <ParamSlider
              label={t('background.bubbleTransparency')}
              value={bubbleTransparency}
              min={0}
              max={1}
              step={0.05}
              formatValue={percent}
              onChange={setBubbleTransparency}
            />
          </GlassSurface>
          <Button variant="glass" label={t('common.save')} onPress={done} disabled={saving} />
        </View>
      </View>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    empty: { ...FILL, alignItems: 'center', justifyContent: 'center', gap: 6 },
    emptyName: { color: colors.text, fontSize: 22, fontWeight: '600' },
    emptyHint: { color: colors.textMuted, fontSize: 15 },
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 10,
      gap: 8,
      width: '100%',
      alignSelf: 'center',
    },
    sample: { position: 'absolute', top: '22%', right: 16, left: 56, alignItems: 'flex-end' },
    bubble: { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10 },
    bubbleText: { color: colors.text, fontSize: 16, lineHeight: 22 },
    cropHint: { color: colors.textFaint, fontSize: 13, marginTop: 14 },
    fakeField: { borderRadius: 22, paddingVertical: 11, paddingHorizontal: 16 },
    fakePlaceholder: { color: colors.textFaint, fontSize: 16 },
    panel: { borderRadius: 24, padding: 12, gap: 10 },
    slider: { borderRadius: 22, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  })
