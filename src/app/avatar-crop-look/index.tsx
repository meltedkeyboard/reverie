import { useNavigation } from 'expo-router'
import { useEffect, useLayoutEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ParamSlider } from '@/components/controls/ParamSlider'
import { useStore } from '@/components/chat/thread/store'
import { useSheetTones } from '@/components/overlays/BottomSheet'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useTranslation } from '@/i18n'
import { avatarCropLook, cropSheetDown, MAX_ZOOM, setCropSheetOpen } from '@/lib/images/avatarCropLook'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

// Far enough to take the controls out of the strip under the bar of the sheet let down.
const HIDE_BY = 160

const times = (value: number) => `${value.toFixed(1)}×`

// The screen of the sheet, laid out as /background-look: the zoom in a card, Choose across
// the foot and the hint under it. Close, centering and the reset are on the bar.
export default function AvatarCropLookScreen() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const tones = useSheetTones({ noGlass: true })
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const look = useStore(avatarCropLook)
  // The zoom under the finger, for the label only: the slider itself is not sent the zoom
  // while it is dragged, so its thumb does not jitter, and the label would stand still.
  const [dragged, setDragged] = useState<number | null>(null)

  useEffect(() => {
    cropSheetDown.set(false)
    setCropSheetOpen(true)
    return () => setCropSheetOpen(false)
  }, [])

  // Let down, only the bar shows: the rest slides down out of the strip above the home
  // indicator. Moved, not faded, as Liquid Glass does not render under a parent with opacity.
  const down = useStore(cropSheetDown)
  const hidden = useSharedValue(0)
  useEffect(() => {
    hidden.value = withTiming(down ? 1 : 0, { duration: 220 })
  }, [down, hidden])
  const shownStyle = useAnimatedStyle(() => ({ transform: [{ translateY: hidden.value * HIDE_BY }] }))

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('avatarCrop.title'),
      unstable_headerLeftItems: () => [
        {
          type: 'button',
          label: t('common.close'),
          icon: { type: 'sfSymbol', name: 'xmark' },
          onPress: () => avatarCropLook.get()?.close(),
        },
      ],
      unstable_headerRightItems: () => [
        {
          type: 'button',
          label: t('avatarCrop.center'),
          icon: { type: 'sfSymbol', name: 'scope' },
          onPress: () => avatarCropLook.get()?.center(),
        },
        {
          type: 'button',
          label: t('avatarCrop.reset'),
          icon: { type: 'sfSymbol', name: 'arrow.counterclockwise' },
          onPress: () => avatarCropLook.get()?.reset(),
        },
      ],
    })
  }, [navigation, t])

  if (!look) return null

  return (
    // No scroll view: everything fits, and a drag anywhere on the sheet moves the sheet.
    <Animated.View style={[styles.content, { paddingBottom: insets.bottom + 16 }, shownStyle]} pointerEvents={down ? 'none' : 'auto'}>
      <View style={[styles.card, { backgroundColor: tones.card }]}>
        <ParamSlider
          label={t('avatarCrop.zoom')}
          value={look.zoom}
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          formatValue={(value) => times(dragged ?? value)}
          onSlidingStart={look.startSlide}
          onChange={(value) => {
            setDragged(value)
            look.slide(value)
          }}
          onSlidingComplete={(value) => {
            setDragged(null)
            look.endSlide(value)
          }}
        />
      </View>

      {/* Across the foot, as Save on /background-look. */}
      <Pressable
        onPress={look.choose}
        disabled={!look.ready || look.saving}
        accessibilityRole="button"
        accessibilityLabel={t('avatarCrop.choose')}
        style={({ pressed }) => [styles.choose, { backgroundColor: colors.accent }, !look.ready && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
      >
        {look.saving ? <ActivityIndicator color={ON_ACCENT} /> : <Text style={styles.chooseText}>{t('avatarCrop.choose')}</Text>}
      </Pressable>
      <View style={styles.hint}>
        <SFIcon name="crop" fallback="crop-outline" size={15} color={colors.textFaint} />
        <Text style={styles.hintText}>{t('avatarCrop.hint')}</Text>
      </View>
    </Animated.View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
    card: { borderRadius: 24, overflow: 'hidden', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    choose: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    chooseText: { color: ON_ACCENT, fontSize: 17, fontWeight: '600' },
    hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    hintText: { color: colors.textFaint, fontSize: 13 },
  })
