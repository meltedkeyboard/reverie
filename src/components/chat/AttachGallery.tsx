import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { useContext, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { GalleryItem } from '@/db/gallery'
import { useTranslation } from '@/i18n'
import type { AttachSession } from '@/lib/chat/attachSession'
import { galleryMessageImage } from '@/lib/images/attachments'
import { galleryUri } from '@/lib/images/gallery'
import { alertError } from '@/lib/transfer/report'
import * as Haptics from '@/lib/ui/haptics'
import { type Colors, FILL, ON_ACCENT, useColors, useStyles, useTheme } from '@/theme'

import { SheetBackdropContext, useSheetTones } from '../overlays/BottomSheet'

const COLUMNS = 3
// Square tiles edge to edge with hairline gaps, as in Photos and the gallery sheet of the editor.
const GAP = 2

// The pictures of the chat's character, or of each of a scene's cast under their names, to
// attach from: ticked in the order they go into the message, as in the menu's row of the
// latest ones, and attached by the button that rises under them.
export function AttachGalleryPicker({
  session,
  onClose,
  scrollStyle,
}: {
  session: AttachSession
  onClose: (then?: () => void) => void
  scrollStyle?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const backdrop = useContext(SheetBackdropContext)
  const galleries = session.galleries ?? []
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<GalleryItem[]>([])
  const [storing, setStoring] = useState(false)
  // Down to a half point, or the rounding of a fraction may push the third tile to the next line.
  const side = width > 0 ? Math.floor(((width - GAP * (COLUMNS - 1)) / COLUMNS) * 2) / 2 : 0

  const toggle = (item: GalleryItem) => {
    Haptics.selectionAsync()
    setSelected((current) => (current.some((other) => other.id === item.id) ? current.filter((other) => other.id !== item.id) : [...current, item]))
  }

  // The gallery's files are stored again, shrunk, as any picture attached to a message.
  const confirm = async () => {
    if (!selected.length || storing) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      setStoring(true)
      const pictures = await Promise.all(selected.map((item) => galleryMessageImage(item.file)))
      session.onAttach(pictures)
      onClose()
    } catch (err) {
      setStoring(false)
      alertError(t('composer.attachFailedTitle'), err)
    }
  }

  const hasSelection = selected.length > 0
  const footerProgress = useSharedValue(0)
  useEffect(() => {
    footerProgress.value = withSpring(hasSelection ? 1 : 0, { stiffness: 300, damping: 28, mass: 0.8 })
  }, [hasSelection, footerProgress])
  const [footerHeight, setFooterHeight] = useState(0)
  const footerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - footerProgress.value) * (footerHeight || 120) }],
    opacity: footerProgress.value > 0.01 ? 1 : 0,
  }))

  const actionLabel = selected.length === 1 ? t('attach.attachSingle') : t('attach.attachMultiple', { count: selected.length })

  return (
    <View style={[styles.container, scrollStyle]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        style={[styles.scroll, scrollStyle]}
        contentContainerStyle={{ paddingBottom: Math.max(76, insets.bottom + 68) }}
        showsVerticalScrollIndicator={false}
      >
        {side > 0
          ? galleries.map((gallery, index) => (
              <View key={index} style={styles.section}>
                {/* A scene's cast each under their own name; a chat's one character needs none. */}
                {galleries.length > 1 ? <Text style={styles.header}>{gallery.name}</Text> : null}
                <View style={styles.grid}>
                  {gallery.items.map((item) => {
                    // Where it stands among the ticked ones: the pictures go into the message in that order.
                    const order = selected.findIndex((other) => other.id === item.id) + 1
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => toggle(item)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: order > 0 }}
                        accessibilityLabel={t('promptGen.galleryPicture')}
                        accessibilityValue={order > 0 ? { text: String(order) } : undefined}
                        style={[styles.tile, { width: side, height: side }]}
                      >
                        <Image source={{ uri: galleryUri(item.file) }} style={styles.image} contentFit="cover" recyclingKey={item.file} autoplay={false} />
                        {order > 0 ? <View style={styles.dim} pointerEvents="none" /> : null}
                        {order > 0 ? (
                          <View style={styles.badge}>
                            <Text style={styles.order}>{order}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ))
          : null}
      </ScrollView>

      {/* Over the chat's background the bar under the button is frosted over it, as the menu's own is. */}
      <Animated.View
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        pointerEvents={hasSelection ? 'auto' : 'none'}
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(16, insets.bottom + 4),
            backgroundColor: backdrop ? 'transparent' : tones.sheet,
            borderTopColor: colors.border,
          },
          footerStyle,
        ]}
      >
        {backdrop ? <BlurView tint={scheme} intensity={55} style={FILL} /> : null}
        <Pressable
          onPress={confirm}
          disabled={storing}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [styles.action, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}
        >
          {storing ? <ActivityIndicator color={ON_ACCENT} /> : <Text style={styles.actionText}>{actionLabel}</Text>}
        </Pressable>
      </Animated.View>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    container: { position: 'relative' },
    scroll: { flexGrow: 0 },
    section: { paddingBottom: 12 },
    header: { color: colors.textMuted, fontSize: 13, fontWeight: '600', paddingTop: 4, paddingBottom: 8, paddingHorizontal: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    tile: { overflow: 'hidden', backgroundColor: colors.surface },
    image: { width: '100%', height: '100%' },
    dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.28)' },
    badge: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 5,
      borderRadius: 11,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    order: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    action: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    actionText: { color: ON_ACCENT, fontSize: 17, fontWeight: '600' },
  })
