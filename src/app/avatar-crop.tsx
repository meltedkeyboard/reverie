import { Image } from 'expo-image'
import { ImageManipulator } from 'expo-image-manipulator'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'

import { Button } from '@/components/controls/Button'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, HeaderTitle } from '@/components/chrome/GlassHeader'
import { useTranslation } from '@/i18n'
import { avatarCropDraft } from '@/lib/images/avatarCrop'
import { squareAvatar } from '@/lib/images/avatars'
import { alertError } from '@/lib/transfer/report'
import { HEADER_ROW_HEIGHT, useColors, useStyles, type Colors } from '@/theme'
import { isWeb } from '@/lib/core/platform'

const MAX_ZOOM = 4
// The hint and the button under the window.
const DOCK_SPACE = 110
// On a screen wider than tall they stand beside the window instead, in a column this wide.
const SIDE_DOCK = 220

// The Files picker has no editor of its own, so a picked file is framed here the way the
// photo library frames a photo: moved and pinched under a round window.
export default function AvatarCropScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  // Read once: the draft may be replaced under a screen still closing.
  const [draft] = useState(avatarCropDraft)
  const [saving, setSaving] = useState(false)
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!draft) return
    ImageManipulator.manipulate(draft.uri)
      .renderAsync()
      .then((picture) => setNatural({ width: picture.width, height: picture.height }))
      .catch((err) => alertError(t('editor.avatarFailedTitle'), err))
  }, [draft, t])

  // The window is the largest circle that fits between the header and the button.
  const landscape = frame.width > frame.height
  const top = insets.top + HEADER_ROW_HEIGHT
  const bottom = insets.bottom + (landscape ? 0 : DOCK_SPACE)
  const left = insets.left
  const right = landscape ? insets.right + SIDE_DOCK : 0
  const diameter = Math.max(0, Math.min(frame.width - left - right - 32, frame.height - top - bottom - 32))
  const cx = left + (frame.width - left - right) / 2
  const cy = top + (frame.height - top - bottom) / 2
  // At zoom 1 the picture just covers the window with its shorter side.
  const cover = natural && diameter ? diameter / Math.min(natural.width, natural.height) : 0
  const pictureWidth = natural ? natural.width * cover : 0
  const pictureHeight = natural ? natural.height * cover : 0

  const zoom = useSharedValue(1)
  const offsetX = useSharedValue(0)
  const offsetY = useSharedValue(0)
  const startZoom = useSharedValue(1)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const coverWidth = useSharedValue(0)
  const coverHeight = useSharedValue(0)
  const window = useSharedValue(0)

  useEffect(() => {
    coverWidth.value = pictureWidth
    coverHeight.value = pictureHeight
    window.value = diameter
  }, [pictureWidth, pictureHeight, diameter, coverWidth, coverHeight, window])

  // A turn of the phone changes the window: the offsets are in its points, so they are
  // scaled with it and the same part of the picture stays in the circle.
  const lastDiameter = useRef(0)
  useEffect(() => {
    const was = lastDiameter.current
    lastDiameter.current = diameter
    if (!was || !diameter || was === diameter) return
    offsetX.value *= diameter / was
    offsetY.value *= diameter / was
  }, [diameter, offsetX, offsetY])

  // Framing redone starts from the old frame: the inverse of what `choose` computes.
  const placed = useRef(false)
  useEffect(() => {
    if (placed.current || !draft?.crop || !natural || !cover) return
    placed.current = true
    const { originX, originY, width } = draft.crop
    const scale = diameter / width
    zoom.value = Math.min(MAX_ZOOM, Math.max(1, scale / cover))
    const k = zoom.value * cover
    const limitX = Math.max(0, (pictureWidth * zoom.value - diameter) / 2)
    const limitY = Math.max(0, (pictureHeight * zoom.value - diameter) / 2)
    offsetX.value = Math.min(limitX, Math.max(-limitX, (natural.width / 2 - (originX + width / 2)) * k))
    offsetY.value = Math.min(limitY, Math.max(-limitY, (natural.height / 2 - (originY + draft.crop.height / 2)) * k))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, natural, cover, diameter])

  // The picture may never leave part of the window uncovered.
  const clampX = (x: number, k: number) => {
    'worklet'
    const limit = Math.max(0, (coverWidth.value * k - window.value) / 2)
    return Math.min(limit, Math.max(-limit, x))
  }
  const clampY = (y: number, k: number) => {
    'worklet'
    const limit = Math.max(0, (coverHeight.value * k - window.value) / 2)
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
  // A mouse cannot pinch: on the desktop the wheel (and a trackpad pinch, which arrives as a
  // wheel with ctrl held) zooms around the cursor. Taken in the capture phase, like the chat list.
  const screen = useRef<View>(null)
  useEffect(() => {
    const node = screen.current as unknown as HTMLElement | null
    if (!isWeb || !node) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = node.getBoundingClientRect()
      const px = e.clientX - box.left - cx
      const py = e.clientY - box.top - cy
      const from = zoom.value
      const to = Math.min(MAX_ZOOM, Math.max(1, from * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))))
      zoom.value = to
      offsetX.value = clampX(px - (px - offsetX.value) * (to / from), to)
      offsetY.value = clampY(py - (py - offsetY.value) * (to / from), to)
    }
    node.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => node.removeEventListener('wheel', onWheel, { capture: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, cy])

  const pictureStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }, { scale: zoom.value }],
  }))

  const onLayout = (event: LayoutChangeEvent) => setFrame(event.nativeEvent.layout)

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const choose = async () => {
    if (!draft || !natural || !cover || saving) return
    setSaving(true)
    try {
      const scale = cover * zoom.value
      const side = Math.min(natural.width, natural.height, Math.round(diameter / scale))
      const originX = Math.round(natural.width / 2 - offsetX.value / scale - side / 2)
      const originY = Math.round(natural.height / 2 - offsetY.value / scale - side / 2)
      const crop = {
        originX: Math.min(natural.width - side, Math.max(0, originX)),
        originY: Math.min(natural.height - side, Math.max(0, originY)),
        width: side,
        height: side,
      }
      draft.onDone(await squareAvatar(draft.uri, crop), crop)
      close()
    } catch (err) {
      setSaving(false)
      alertError(t('editor.avatarFailedTitle'), err)
    }
  }

  const r = diameter / 2
  // The screen with a round hole in it: evenodd leaves the circle unfilled.
  const shade = `M0 0H${frame.width}V${frame.height}H0Z M${cx - r} ${cy} a${r} ${r} 0 1 0 ${diameter} 0 a${r} ${r} 0 1 0 ${-diameter} 0Z`

  return (
    <View ref={screen} style={styles.screen} onLayout={onLayout}>
      <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
        <View style={StyleSheet.absoluteFill}>
          {draft && natural && diameter ? (
            <Animated.View
              style={[
                styles.picture,
                { left: cx - pictureWidth / 2, top: cy - pictureHeight / 2, width: pictureWidth, height: pictureHeight },
                pictureStyle,
              ]}
            >
              <Image source={{ uri: draft.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      {diameter ? (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={shade} fill={`rgba(${colors.bgRgb}, 0.78)`} fillRule="evenodd" />
          <Circle cx={cx} cy={cy} r={r} stroke={colors.borderStrong} strokeWidth={1} fill="none" />
        </Svg>
      ) : null}

      <GlassHeader floating left={<GlassButton icon="chevron-back" iconSize={26} onPress={close} />}>
        <HeaderTitle>{t('avatarCrop.title')}</HeaderTitle>
      </GlassHeader>

      <View
        style={
          landscape
            ? [styles.sideDock, { top, right: insets.right + 16, bottom: insets.bottom + 16 }]
            : [styles.dock, { paddingBottom: insets.bottom + 8 }]
        }
        pointerEvents="box-none"
      >
        <Text style={styles.hint}>{t('avatarCrop.hint')}</Text>
        <Button variant="glass" label={t('avatarCrop.choose')} onPress={choose} disabled={!natural} loading={saving} />
      </View>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
    picture: { position: 'absolute' },
    dock: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 12, alignItems: 'center' },
    sideDock: { position: 'absolute', width: SIDE_DOCK - 32, gap: 12, justifyContent: 'center' },
    hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  })
