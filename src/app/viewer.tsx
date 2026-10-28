import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, StyleSheet, Text, View, type ViewStyle, type ViewInstance } from 'react-native'
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassButton } from '@/components/chrome/Glass'
import { TITLE_BAR_HEIGHT } from '@/components/chrome/TitleBar'
import { Gallery, type GalleryHandle } from '@/components/viewer/Gallery'
import { RemoveButton } from '@/components/viewer/RemoveButton'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useDatabase } from '@/db/provider'
import { isKey, useWindowKey } from '@/hooks/util/useWindowKey'
import { useTranslation } from '@/i18n'
import { isElectron, isWeb } from '@/lib/core/platform'
import { isVideo } from '@/lib/images/media'
import { findOriginal, setLifted, viewerImages, type ViewerOrigin, type ViewerOriginal } from '@/lib/images/viewer'
import { saveImage } from '@/lib/transfer/download'
import { alertError } from '@/lib/transfer/report'
import * as Haptics from '@/lib/ui/haptics'
import { FILL, useStyles, useTheme, type Colors } from '@/theme'

type Frame = { x: number; y: number; width: number; height: number }

// The same empty list every time, so the gallery doesn't work out its flights again.
const NO_ORIGINS: (ViewerOrigin | null)[] = []

export default function ViewerScreen() {
  const router = useRouter()
  const db = useDatabase()
  const insets = useSafeAreaInsets()
  const { colors, scheme } = useTheme()
  const { t } = useTranslation()
  const styles = useStyles(createStyles)
  // Read once: the stored pictures may change under a screen still closing. Only a picture
  // deleted here changes them.
  const [pending, setPending] = useState(viewerImages)
  const images = pending?.images ?? []
  const origins = pending?.origins ?? NO_ORIGINS
  const [initialIndex] = useState(pending?.index ?? 0)
  const [index, setIndex] = useState(initialIndex)
  // The thumbnail of the picture shown, which is where it goes back to on closing.
  const source = pending?.sources[index] ?? null
  const [chrome, setChrome] = useState(true)
  const [frame, setFrame] = useState<Frame | null>(null)
  const root = useRef<ViewInstance>(null)
  const gallery = useRef<GalleryHandle>(null)

  const leave = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), [router])

  // Opened with nothing to show, as by a reload on the web.
  useEffect(() => {
    if (!images.length) leave()
  }, [images.length, leave])

  // The thumbnail hides as the picture leaves it, and shows again once it is back or another
  // picture is swiped in, whose own thumbnail hides instead.
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

  // The picture deleted has faded out: it goes from where it came from, and the viewer goes on
  // with the rest, which now land back in their own places; the last one gone, it closes.
  const removed = useCallback(
    (at: number) => {
      if (!pending?.remove) return
      const origins = pending.remove(at)
      const images = pending.images.filter((_, i) => i !== at)
      if (!images.length) return closed()
      const next = Math.min(at, images.length - 1)
      setPending({ ...pending, images, origins, sources: pending.sources.filter((_, i) => i !== at), index: next })
      setIndex(next)
    },
    [pending, closed]
  )

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

  // The whole original each avatar was cut from, looked up as its picture comes up rather than
  // for all of a cast at once: an original framed before frames kept its size is decoded to
  // be measured.
  const [originals, setOriginals] = useState<(ViewerOriginal | null)[]>([])
  const looked = useRef(new Set<number>())
  useEffect(() => {
    const avatar = images[index]?.avatar
    if (!avatar || looked.current.has(index)) return
    looked.current.add(index)
    findOriginal(db, avatar).then((original) => {
      if (!original) return
      setOriginals((was) => {
        const next = [...was]
        next[index] = original
        return next
      })
    })
  }, [db, images, index])
  // The originals that have loaded, which their avatars can be swapped for, and whether the
  // picture shown is one.
  const [loadedOriginals, setLoadedOriginals] = useState<ReadonlySet<number>>(() => new Set())
  const [originalShown, setOriginalShown] = useState(false)
  const originalLoaded = useCallback((i: number, loaded: boolean) => {
    setLoadedOriginals((was) => {
      if (was.has(i) === loaded) return was
      const next = new Set(was)
      if (loaded) next.add(i)
      else next.delete(i)
      return next
    })
  }, [])
  const original = loadedOriginals.has(index) ? (originals[index] ?? null) : null
  const toggleOriginal = () => {
    Haptics.selectionAsync()
    gallery.current?.toggleOriginal()
  }

  const current = images[index]
  const removable = pending?.remove !== undefined
  const video = current ? isVideo(current.uri) : false
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
      // The picture as it is shown: an avatar's original when that is out.
      await saveImage(original && originalShown ? original.uri : current.uri)
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
          originals={originals}
          frame={frame}
          topTravel={insets.top + 64}
          bottomTravel={insets.bottom + 64}
          onIndexChange={setIndex}
          onChromeChange={setChrome}
          onOriginalLoad={originalLoaded}
          onOriginalChange={setOriginalShown}
          onClosed={closed}
          onRemoved={removed}
          top={
            <View
              style={[styles.bar, { paddingTop: insets.top + 4, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}
              pointerEvents="box-none"
            >
              <GlassButton icon="close" onPress={() => gallery.current?.close()} accessibilityLabel={t('common.close')}>
                <SFIcon name="xmark" fallback="close" size={19} color={colors.text} />
              </GlassButton>
              <View style={styles.actions} pointerEvents="box-none">
                {original ? (
                  // Glass, so it comes and goes by scale alone: glass does not render under a
                  // parent with opacity.
                  <Animated.View entering={ZoomIn.springify().stiffness(280).damping(24).mass(0.85)} exiting={ZoomOut.duration(140)}>
                    <GlassButton
                      icon={originalShown ? 'crop-outline' : 'expand-outline'}
                      onPress={toggleOriginal}
                      accessibilityLabel={t(originalShown ? 'images.showCropped' : 'images.showOriginal')}
                    >
                      <SFIcon
                        name={originalShown ? 'crop' : 'arrow.up.left.and.arrow.down.right'}
                        fallback={originalShown ? 'crop-outline' : 'expand-outline'}
                        size={19}
                        color={colors.text}
                        animateChange
                      />
                    </GlassButton>
                  </Animated.View>
                ) : null}
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
            </View>
          }
          bottom={
            images.length > 1 || removable ? (
              // The counter in the middle and, for the pictures of a gallery, the bin at the
              // trailing edge, as the bottom bar of Photos has it.
              <View style={[styles.bottomBar, { marginBottom: insets.bottom + 4 }]} pointerEvents="box-none">
                {images.length > 1 ? (
                  <View style={styles.counter} pointerEvents="none">
                    <Text style={styles.counterText}>
                      {index + 1} / {images.length}
                    </Text>
                  </View>
                ) : null}
                {removable && current ? (
                  <View style={[styles.trailing, { right: insets.right + 12 }]}>
                    <RemoveButton
                      message={t(video ? 'gallery.deleteVideoMessage' : 'gallery.deletePictureMessage')}
                      action={t(video ? 'gallery.deleteVideo' : 'gallery.deletePicture')}
                      accessibilityLabel={t('common.delete')}
                      onConfirm={() => gallery.current?.remove()}
                    />
                  </View>
                ) : null}
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
    actions: { flexDirection: 'row', gap: 8 },
    // As tall as the glass buttons, the counter in its middle.
    bottomBar: { height: 44, alignItems: 'center', justifyContent: 'center' },
    trailing: { position: 'absolute', top: 0 },
    counter: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    counterText: { color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  })
