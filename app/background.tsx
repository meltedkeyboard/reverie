import { ImageManipulator } from 'expo-image-manipulator'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { Button } from '@/components/Button'
import { ChatBackground } from '@/components/ChatBackground'
import { ChipGroup } from '@/components/ChipGroup'
import { GlassButton, GlassSurface, useGlassStyles } from '@/components/Glass'
import { GlassHeader, HeaderTitle } from '@/components/GlassHeader'
import { ParamSlider } from '@/components/ParamSlider'
import type { BackgroundEffect } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { frameBackground } from '@/lib/avatars'
import { backgroundDraft } from '@/lib/backgroundDraft'
import {
  clamp,
  coverSize,
  cropFromTransform,
  IDENTITY,
  isIdentity,
  limits,
  MAX_ZOOM,
  rubber,
  transformFromCrop,
} from '@/lib/backgroundFrame'
import { withAlpha } from '@/lib/color'
import * as Haptics from '@/lib/haptics'
import { liquidGlass } from '@/lib/nativeUI'
import { type Colors, FILL, useColors, useStyles } from '@/theme'

const DOUBLE_TAP_ZOOM = 2
const SPRING = { damping: 22, stiffness: 220, mass: 0.9 }
const FADE = { duration: 200 }

const percent = (value: number) => `${Math.round(value * 100)}%`

const bump = () => Haptics.selectionAsync()

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
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  // The size of the original with its orientation applied, which expo-image's onLoad doesn't.
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const cover = natural && frame.width ? coverSize(natural, frame) : null
  const [framed, setFramed] = useState(!!draft?.crop)

  const k = useSharedValue(1)
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const pinchStart = useSharedValue({ k: 1, x: 0, y: 0, fx: 0, fy: 0 })
  const lastPan = useSharedValue({ x: 0, y: 0 })
  const pinching = useSharedValue(false)
  const active = useSharedValue(0)
  const hitBound = useSharedValue(false)
  const appear = useSharedValue(0)
  const grid = useSharedValue(0)
  const hint = useSharedValue(1)

  useEffect(() => {
    if (!draft) return
    ImageManipulator.manipulate(draft.uri)
      .renderAsync()
      .then((picture) => setNatural({ width: picture.width, height: picture.height }))
      .catch(() => {})
  }, [draft])

  // The picture shows only once it is laid out and put where it was framed last, so it
  // never jumps from the screen's size to its own.
  const placed = useRef(false)
  useEffect(() => {
    if (placed.current || !natural || !cover) return
    placed.current = true
    const start = draft?.crop ? transformFromCrop(natural, frame, draft.crop) : IDENTITY
    k.value = start.k
    x.value = start.x
    y.value = start.y
    appear.value = withTiming(1, FADE)
  }, [draft, natural, cover, frame, k, x, y, appear])

  useAnimatedReaction(
    () => isIdentity({ k: k.value, x: x.value, y: y.value }),
    (identity, previous) => {
      if (identity !== previous) scheduleOnRN(setFramed, !identity)
    },
  )

  const width = frame.width
  const height = frame.height
  const size = cover ?? frame

  const stopAll = () => {
    'worklet'
    cancelAnimation(k)
    cancelAnimation(x)
    cancelAnimation(y)
  }

  // Shown while a finger is on the picture: the grid, and the hint goes for good.
  const touchStart = () => {
    'worklet'
    if (active.value === 0) {
      hitBound.value = false
      grid.value = withTiming(1, FADE)
      hint.value = withTiming(0, FADE)
    }
    active.value += 1
  }
  const touchEnd = () => {
    'worklet'
    active.value = Math.max(0, active.value - 1)
    if (active.value === 0) grid.value = withTiming(0, FADE)
  }

  // One tick when a bound is first met in a gesture.
  const feelBound = (outside: boolean) => {
    'worklet'
    if (outside && !hitBound.value) {
      hitBound.value = true
      scheduleOnRN(bump)
    }
  }

  // Coasting on with the finger's speed, stopping at the edge.
  const release = (value: SharedValue<number>, limit: number, velocity: number) => {
    'worklet'
    if (limit > 0) value.value = withDecay({ velocity, clamp: [-limit, limit] })
  }

  const settle = (nk: number, nx: number, ny: number) => {
    'worklet'
    const next = clamp(nk, 1, MAX_ZOOM)
    const limit = limits(size, frame, next)
    k.value = withSpring(next, SPRING)
    x.value = withSpring(clamp(nx, -limit.x, limit.x), SPRING)
    y.value = withSpring(clamp(ny, -limit.y, limit.y), SPRING)
  }

  // The point between the fingers stays under them: focal points are taken from the
  // screen's center, which is the picture's center at rest.
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      stopAll()
      touchStart()
      pinching.value = true
      pinchStart.value = { k: k.value, x: x.value, y: y.value, fx: e.focalX - width / 2, fy: e.focalY - height / 2 }
    })
    .onUpdate((e) => {
      const s = pinchStart.value
      const raw = s.k * e.scale
      // Never below covering the screen; past the largest zoom it gives a little and springs back.
      const next = rubber(Math.max(1, raw), 1, MAX_ZOOM, 1)
      feelBound(raw > MAX_ZOOM || raw < 1)
      const ratio = next / s.k
      const fx = e.focalX - width / 2
      const fy = e.focalY - height / 2
      const limit = limits(size, frame, next)
      k.value = next
      x.value = clamp(fx - (s.fx - s.x) * ratio, -limit.x, limit.x)
      y.value = clamp(fy - (s.fy - s.y) * ratio, -limit.y, limit.y)
    })
    .onEnd(() => {
      pinching.value = false
      settle(k.value, x.value, y.value)
      touchEnd()
    })

  // By steps rather than from where it began, so a pinch in between (which moves the
  // picture itself) or a finger lifted off it doesn't make it jump.
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart((e) => {
      stopAll()
      touchStart()
      lastPan.value = { x: e.translationX, y: e.translationY }
    })
    .onUpdate((e) => {
      const dx = e.translationX - lastPan.value.x
      const dy = e.translationY - lastPan.value.y
      lastPan.value = { x: e.translationX, y: e.translationY }
      if (pinching.value) return
      // A hard stop at the edges: no gap is ever shown, not even for a moment.
      const limit = limits(size, frame, k.value)
      const nx = x.value + dx
      const ny = y.value + dy
      feelBound((limit.x > 0 && Math.abs(nx) > limit.x + 1) || (limit.y > 0 && Math.abs(ny) > limit.y + 1))
      x.value = clamp(nx, -limit.x, limit.x)
      y.value = clamp(ny, -limit.y, limit.y)
    })
    .onEnd((e) => {
      if (!pinching.value) {
        const limit = limits(size, frame, k.value)
        release(x, limit.x, e.velocityX)
        release(y, limit.y, e.velocityY)
      }
      touchEnd()
    })

  // In at the tapped point, or all the way back out.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(12)
    .onEnd((e) => {
      stopAll()
      if (k.value > 1.01) {
        settle(1, 0, 0)
        return
      }
      const px = e.x - width / 2
      const py = e.y - height / 2
      const ratio = DOUBLE_TAP_ZOOM / k.value
      settle(DOUBLE_TAP_ZOOM, px - (px - x.value) * ratio, py - (py - y.value) * ratio)
    })

  const reset = () => {
    stopAll()
    settle(1, 0, 0)
  }

  const pictureStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: k.value }],
  }))
  const gridStyle = useAnimatedStyle(() => ({ opacity: grid.value }))
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }))

  const onLayout = (event: LayoutChangeEvent) => setFrame(event.nativeEvent.layout)

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const done = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (draft) {
        // Taken where a spring would come to rest, not halfway through it.
        stopAll()
        const zoom = clamp(k.value, 1, MAX_ZOOM)
        const limit = limits(size, frame, zoom)
        const crop = natural ? cropFromTransform(natural, frame, { k: zoom, x: clamp(x.value, -limit.x, limit.x), y: clamp(y.value, -limit.y, limit.y) }) : null
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
      {/* The gestures are on a still layer the size of the screen, so their points are in
          the screen's coordinates and not in those of the moving picture. */}
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
        <View style={StyleSheet.absoluteFill}>
          {/* Laid out at its covering size, not the screen's: an image view clips to its
              own bounds, so a screen-sized one moved over shows empty space instead of
              the rest of the picture. */}
          {cover ? (
            <Animated.View
              style={[
                styles.picture,
                { width: cover.width, height: cover.height, left: (width - cover.width) / 2, top: (height - cover.height) / 2 },
                pictureStyle,
              ]}
            >
              <ChatBackground uri={draft.uri} effect={effect} intensity={intensity} />
            </Animated.View>
          ) : null}

          {/* Thirds, while the picture is being framed. */}
          <Animated.View style={[StyleSheet.absoluteFill, gridStyle]} pointerEvents="none">
            {[1, 2].map((i) => (
              <View key={`v${i}`} style={[styles.gridLine, { left: (width * i) / 3, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
            ))}
            {[1, 2].map((i) => (
              <View key={`h${i}`} style={[styles.gridLine, { top: (height * i) / 3, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.empty} pointerEvents="none">
        <Text style={styles.emptyName}>{draft.characterName}</Text>
        <Text style={styles.emptyHint}>{t('chat.emptyHint')}</Text>
        <Animated.Text style={[styles.cropHint, hintStyle]}>{t('background.cropHint')}</Animated.Text>
      </View>

      {/* A message of the user's, to judge how see-through its bubble is. */}
      <View style={styles.sample} pointerEvents="none">
        <View style={[styles.bubble, { backgroundColor: withAlpha(colors.bubble, 1 - bubbleTransparency) }]}>
          <Text style={styles.bubbleText}>{t('background.sampleMessage')}</Text>
        </View>
      </View>

      <GlassHeader
        floating
        left={<GlassButton icon="chevron-back" iconSize={26} onPress={close} />}
        right={framed ? <GlassButton icon="refresh" iconSize={22} onPress={reset} accessibilityLabel={t('background.reset')} /> : null}
      >
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
          <ChipGroup options={options} value={effect} onChange={setEffect} />
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
    picture: { position: 'absolute' },
    gridLine: { position: 'absolute', backgroundColor: withAlpha('#ffffff', 0.55) },
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
