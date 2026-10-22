import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassButton } from '@/components/chrome/Glass'
import { TITLE_BAR_HEIGHT } from '@/components/chrome/TitleBar'
import { Gallery, type GalleryHandle } from '@/components/viewer/Gallery'
import { SFIcon } from '@/components/visuals/SFIcon'
import { isKey, useWindowKey } from '@/hooks/util/useWindowKey'
import { useTranslation } from '@/i18n'
import { isElectron, isWeb } from '@/lib/core/platform'
import { setLifted, viewerImages, type ViewerOrigin } from '@/lib/images/viewer'
import { saveImage } from '@/lib/transfer/download'
import { alertError } from '@/lib/transfer/report'
import * as Haptics from '@/lib/ui/haptics'
import { FILL, useStyles, useTheme, type Colors } from '@/theme'

type Frame = { x: number; y: number; width: number; height: number }

// The same empty list every time, so the gallery doesn't work out its flights again.
const NO_ORIGINS: (ViewerOrigin | null)[] = []

export default function ViewerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors, scheme } = useTheme()
  const { t } = useTranslation()
  const styles = useStyles(createStyles)
  // Read once: the stored pictures may change under a screen still closing.
  const [pending] = useState(viewerImages)
  const images = pending?.images ?? []
  const origins = pending?.origins ?? NO_ORIGINS
  const source = pending?.source ?? null
  const [initialIndex] = useState(pending?.index ?? 0)
  const [index, setIndex] = useState(initialIndex)
  const [chrome, setChrome] = useState(true)
  const [frame, setFrame] = useState<Frame | null>(null)
  const root = useRef<View>(null)
  const gallery = useRef<GalleryHandle>(null)

  const leave = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), [router])

  // Opened with nothing to show, as by a reload on the web.
  useEffect(() => {
    if (!images.length) leave()
  }, [images.length, leave])

  // The thumbnail hides as the picture leaves it, and shows again once it is back.
  const measured = frame !== null
  useEffect(() => {
    if (!measured || !source) return
    setLifted(source)
    return () => setLifted(null)
  }, [measured, source])

  // The picture is back on its thumbnail or gone: the thumbnail comes back under it a few
  // frames before the viewer goes, so nothing blinks between the two. Once only.
  const gone = useRef(false)
  const closed = useCallback(() => {
    if (gone.current) return
    gone.current = true
    setLifted(null)
    setTimeout(leave, 60)
  }, [leave])

  // The back key on Android and Escape on the desktop close it as the button does; the arrows
  // turn the pictures.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      gallery.current?.close()
      return true
    })
    return () => sub.remove()
  }, [])
  useWindowKey(isKey('Escape'), () => gallery.current?.close())
  useWindowKey(
    (e) => e.key === 'ArrowLeft' || e.key === 'ArrowRight',
    (e) => gallery.current?.go(e.key === 'ArrowLeft' ? -1 : 1)
  )

  // The viewer's place in the window, which the thumbnail was measured in (below the title bar
  // of the desktop app), and its size, which is a page's.
  const measure = () => {
    root.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return
      setFrame((was) =>
        was && was.x === x && was.y === y && was.width === width && was.height === height ? was : { x, y, width, height }
      )
    })
  }

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
    <View ref={root} style={styles.root} onLayout={measure} accessibilityViewIsModal>
      {/* Hidden with the bars, as in Photos. */}
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} hidden={!chrome} animated />
      {frame && images.length ? (
        <Gallery
          ref={gallery}
          images={images}
          initialIndex={initialIndex}
          origins={origins}
          frame={frame}
          topTravel={insets.top + 64}
          onIndexChange={setIndex}
          onChromeChange={setChrome}
          onClosed={closed}
          top={
            <View
              style={[styles.bar, { paddingTop: insets.top + 4, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}
              pointerEvents="box-none"
            >
              <GlassButton icon="close" onPress={() => gallery.current?.close()} accessibilityLabel={t('common.close')}>
                <SFIcon name="xmark" fallback="close" size={19} color={colors.text} />
              </GlassButton>
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
          }
          bottom={
            images.length > 1 ? (
              <View style={[styles.counter, { marginBottom: insets.bottom + 16 }]}>
                <Text style={styles.counterText}>
                  {index + 1} / {images.length}
                </Text>
              </View>
            ) : null
          }
        />
      ) : null}
    </View>
  )
}

// The whole window, or in the desktop app all of it below the title bar: the viewer goes over
// the sidebar as well, which react-native-web allows with a fixed position RN's types don't know.
const WINDOW = isWeb
  ? ({ position: 'fixed', top: isElectron ? TITLE_BAR_HEIGHT : 0, left: 0, right: 0, bottom: 0, zIndex: 100 } as unknown as ViewStyle)
  : FILL

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { ...WINDOW, overflow: 'hidden' },
    bar: { flexDirection: 'row', justifyContent: 'space-between' },
    counter: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    counterText: { color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  })
