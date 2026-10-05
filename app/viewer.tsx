import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { FlatList, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { GlassButton } from '@/components/Glass'
import { Picture } from '@/components/Picture'
import { SFIcon } from '@/components/SFIcon'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import { saveImage } from '@/lib/download'
import { viewerImages, type ViewerImage } from '@/lib/viewer'
import { alertError } from '@/lib/report'
import { isIOS } from '@/lib/platform'
import { useStyles, useTheme, type Colors } from '@/theme'

const MAX_SCALE = 5
const DOUBLE_TAP_SCALE = 2.5
const EASE = { duration: 220 }
const TAP_SLOP = 10

export default function ViewerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const { colors } = useTheme()
  const { t } = useTranslation()
  const styles = useStyles(createStyles)
  // Read once: the stored pictures may change under a screen still closing.
  const [pending] = useState(viewerImages)
  const images = pending?.images ?? []
  const [index, setIndex] = useState(pending?.index ?? 0)
  // Paging would fight the pan of a zoomed picture, so it is off while one is zoomed.
  const [zoomed, setZoomed] = useState(false)

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))
  const current = images[index]
  // The button turns into a checkmark for a moment, since Photos gives no sign of its own.
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 1500)
    return () => clearTimeout(timer)
  }, [saved])
  const save = async () => {
    if (!current) return
    try {
      await saveImage(current.uri)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setSaved(true)
    } catch (err) {
      alertError(t('images.saveFailed'), err)
    }
  }

  return (
    <View style={styles.screen}>
      {/* Keyed by the window: after a turn the pages are a new width, so the list is laid out
          again at the picture that was open, and a zoom left over from the other way goes. */}
      <FlatList
        key={`${window.width}x${window.height}`}
        data={images}
        keyExtractor={(image, i) => `${i}:${image.uri.slice(-40)}`}
        horizontal
        pagingEnabled
        scrollEnabled={images.length > 1 && !zoomed}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: window.width, offset: window.width * i, index: i })}
        scrollEventThrottle={16}
        // Clamped: an overscroll past either end would count a page that isn't there.
        onScroll={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / window.width)
          setIndex(Math.min(images.length - 1, Math.max(0, page)))
        }}
        onLayout={() => setZoomed(false)}
        renderItem={({ item }) =>
          isIOS ? (
            <NativeZoomImage
              image={item}
              width={window.width}
              height={window.height}
              onZoomChange={setZoomed}
              onTap={close}
            />
          ) : (
            <ZoomableImage image={item} width={window.width} height={window.height} onZoomChange={setZoomed} onTap={close} />
          )
        }
      />
      <View style={[styles.bar, { top: insets.top + 4, left: insets.left + 12, right: insets.right + 12 }]} pointerEvents="box-none">
        <GlassButton icon="chevron-back" iconSize={26} onPress={close} />
        {current ? (
          <GlassButton
            icon={saved ? 'checkmark' : 'download-outline'}
            onPress={save}
            accessibilityLabel={t(saved ? 'images.saved' : 'images.save')}
          >
            <SFIcon
              name={saved ? 'checkmark' : 'square.and.arrow.down'}
              fallback={saved ? 'checkmark' : 'download-outline'}
              size={20}
              color={colors.text}
              animateChange
            />
          </GlassButton>
        ) : null}
      </View>
      {images.length > 1 ? (
        <View style={[styles.counter, { bottom: insets.bottom + 16 }]} pointerEvents="none">
          <Text style={styles.counterText}>
            {index + 1} / {images.length}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

type NativeZoomProps = {
  image: ViewerImage
  width: number
  height: number
  onZoomChange: (zoomed: boolean) => void
  onTap: () => void
}

// iOS: the picture sits in a scroll view that zooms, pans and bounces by itself, with the
// system physics. A double tap zooms to the point or back out, a single tap closes.
function NativeZoomImage({ image, width, height, onZoomChange, onTap }: NativeZoomProps) {
  const frameWidth = Math.min(width, height * image.aspect)
  const frameHeight = frameWidth / image.aspect
  const scroller = useRef<ScrollView>(null)
  const zoomed = useRef(false)

  const track = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const isZoomed = e.nativeEvent.zoomScale > 1.01
    if (isZoomed !== zoomed.current) {
      zoomed.current = isZoomed
      onZoomChange(isZoomed)
    }
  }

  const zoomAt = (x: number, y: number) => {
    if (zoomed.current) {
      scroller.current?.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: true })
      return
    }
    // The content is as large as the screen, so a tap's point is the point in the content.
    const w = width / DOUBLE_TAP_SCALE
    const h = height / DOUBLE_TAP_SCALE
    scroller.current?.scrollResponderZoomTo({ x: x - w / 2, y: y - h / 2, width: w, height: h, animated: true })
  }
  const tapped = () => {
    if (!zoomed.current) onTap()
  }

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(TAP_SLOP)
    .onEnd((e) => {
      scheduleOnRN(zoomAt, e.x, e.y)
    })
  const singleTap = Gesture.Tap()
    .maxDistance(TAP_SLOP)
    .onEnd(() => {
      scheduleOnRN(tapped)
    })

  return (
    <GestureDetector gesture={Gesture.Exclusive(doubleTap, singleTap)}>
      <ScrollView
        ref={scroller}
        style={{ width, height }}
        // As large as the screen, the picture centered in it: with a content narrower than
        // the screen and centerContent, UIKit shifted it sideways after a bounce past the
        // largest zoom.
        contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}
        minimumZoomScale={1}
        maximumZoomScale={MAX_SCALE}
        bouncesZoom
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={track}
      >
        <Picture uri={image.uri} style={{ width: frameWidth, height: frameHeight }} contentFit="contain" />
      </ScrollView>
    </GestureDetector>
  )
}

type ZoomableProps = {
  image: ViewerImage
  width: number
  height: number
  onZoomChange: (zoomed: boolean) => void
  onTap: () => void
}

// Pinch to zoom around the fingers, drag the zoomed picture, double tap to zoom in at a
// point or back out. A single tap on an unzoomed picture closes the viewer.
function ZoomableImage({ image, width, height, onZoomChange, onTap }: ZoomableProps) {
  // The picture's own frame, so it is never stretched.
  const frameWidth = Math.min(width, height * image.aspect)
  const frameHeight = frameWidth / image.aspect

  const scale = useSharedValue(1)
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const start = useSharedValue({ scale: 1, x: 0, y: 0, focalX: 0, focalY: 0 })
  const pinching = useSharedValue(false)
  const lastPan = useSharedValue({ x: 0, y: 0 })

  // How far a picture at scale s may move before its edge leaves the screen's edge.
  const limit = (s: number) => {
    'worklet'
    return { x: Math.max(0, (frameWidth * s - width) / 2), y: Math.max(0, (frameHeight * s - height) / 2) }
  }
  const clamp = (value: number, max: number) => {
    'worklet'
    return Math.min(max, Math.max(-max, value))
  }
  const settle = (s: number, nx: number, ny: number) => {
    'worklet'
    const next = Math.min(MAX_SCALE, Math.max(1, s))
    const max = limit(next)
    scale.value = withTiming(next, EASE)
    x.value = withTiming(clamp(nx, max.x), EASE)
    y.value = withTiming(clamp(ny, max.y), EASE)
    scheduleOnRN(onZoomChange, next > 1)
  }

  // Focal points come relative to the page; the transform works from its center.
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinching.value = true
      // The pager stops at once, not when the pinch ends; settle() turns it back on.
      scheduleOnRN(onZoomChange, true)
      start.value = { scale: scale.value, x: x.value, y: y.value, focalX: e.focalX - width / 2, focalY: e.focalY - height / 2 }
    })
    .onUpdate((e) => {
      const s0 = start.value
      // A little below 1 is allowed while pinching, so letting go springs back.
      const next = Math.min(MAX_SCALE * 1.2, Math.max(0.7, s0.scale * e.scale))
      const ratio = next / s0.scale
      scale.value = next
      x.value = s0.focalX - (s0.focalX - s0.x) * ratio + (e.focalX - width / 2 - s0.focalX)
      y.value = s0.focalY - (s0.focalY - s0.y) * ratio + (e.focalY - height / 2 - s0.focalY)
    })
    .onEnd(() => {
      pinching.value = false
      settle(scale.value, x.value, y.value)
    })

  // Only a zoomed picture is dragged; otherwise the touch is left to the pager. It moves
  // by steps rather than from where it began, so a pinch in between (which moves the
  // picture itself) doesn't make it jump back.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_, manager) => {
      if (scale.value > 1.01) manager.activate()
      else manager.fail()
    })
    .onStart(() => {
      lastPan.value = { x: 0, y: 0 }
    })
    .onUpdate((e) => {
      const dx = e.translationX - lastPan.value.x
      const dy = e.translationY - lastPan.value.y
      lastPan.value = { x: e.translationX, y: e.translationY }
      if (pinching.value) return
      const max = limit(scale.value)
      x.value = clamp(x.value + dx, max.x)
      y.value = clamp(y.value + dy, max.y)
    })

  // Without a distance limit a quick swipe to the next page counts as a tap on iOS.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(TAP_SLOP)
    .onEnd((e) => {
      if (scale.value > 1.01) {
        settle(1, 0, 0)
        return
      }
      // The tapped point stays under the finger.
      const px = e.x - width / 2
      const py = e.y - height / 2
      settle(DOUBLE_TAP_SCALE, px * (1 - DOUBLE_TAP_SCALE), py * (1 - DOUBLE_TAP_SCALE))
    })

  const singleTap = Gesture.Tap()
    .maxDistance(TAP_SLOP)
    .onEnd(() => {
      if (scale.value <= 1.01) scheduleOnRN(onTap)
    })

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap))

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }))

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Animated.View style={[{ width: frameWidth, height: frameHeight }, imageStyle]}>
          <Picture uri={image.uri} style={StyleSheet.absoluteFill} contentFit="contain" />
        </Animated.View>
      </View>
    </GestureDetector>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    bar: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between' },
    counter: {
      position: 'absolute',
      alignSelf: 'center',
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    counterText: { color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  })
