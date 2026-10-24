import { useNavigation } from 'expo-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ParamSlider } from '@/components/controls/ParamSlider'
import { NativeForm, NativeSection, NativeSliderRow, nativeForm } from '@/components/lists/NativeForm'
import { useStore } from '@/components/chat/thread/store'
import { useSheetTones } from '@/components/overlays/BottomSheet'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useTranslation } from '@/i18n'
import { avatarCropLook, cropSheetDown, MAX_ZOOM, setCropSheetOpen } from '@/lib/images/avatarCropLook'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

// Far enough to take the controls out of the strip under the bar of the sheet let down.
const HIDE_BY = 160

// The room the system's list leaves above its first section, as on /background-look.
const LIST_TOP = 35

const times = (value: number) => `${value.toFixed(1)}×`

// The screen of the sheet, laid out as /background-look: the zoom in a card, Choose across
// the foot and the hint under it. Close, centering and the reset are on the bar. With SwiftUI
// the card is the system's own list and the slider the system's.
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
  // Where the system's slider was let go: it says only that the finger left it.
  const lastZoom = useRef(1)

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
    // No scroll view: everything fits, and a drag anywhere on the sheet moves the sheet. Over
    // the taller row of the system's list the hint comes down nearer the sheet's rounded foot,
    // as on /background-look.
    <Animated.View
      style={[styles.content, nativeForm && styles.fill, { paddingBottom: nativeForm ? insets.bottom - 6 : insets.bottom + 16 }, shownStyle]}
      pointerEvents={down ? 'none' : 'auto'}
    >
      {nativeForm ? (
        <View style={styles.systemList}>
          {/* It does not scroll, so a drag on it moves the sheet as anywhere else, and it keeps
              out of the safe area, which changes as the controls slide down with the sheet. The
              zoom has no steps: the system's slider would tick at every one. */}
          <NativeForm
            clear
            modifiers={[nativeForm.modifiers.scrollDisabled(true), nativeForm.modifiers.ignoreSafeArea()]}
          >
            <NativeSection fill={tones.card}>
              <NativeSliderRow
                label={t('avatarCrop.zoom')}
                value={dragged ?? look.zoom}
                min={1}
                max={MAX_ZOOM}
                format={times}
                onEditing={(editing) => {
                  if (editing) {
                    look.startSlide()
                    return
                  }
                  setDragged(null)
                  look.endSlide(lastZoom.current)
                }}
                onChange={(value) => {
                  lastZoom.current = value
                  setDragged(value)
                  look.slide(value)
                }}
              />
            </NativeSection>
          </NativeForm>
        </View>
      ) : (
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
      )}

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
    fill: { flex: 1 },
    // Out to the edges of the sheet, as the list keeps margins of its own, and up by the room
    // it leaves above its first section, under the bar, so the card stands where it did.
    systemList: { flex: 1, marginHorizontal: -16, marginTop: -LIST_TOP },
    card: { borderRadius: 24, overflow: 'hidden', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    choose: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    chooseText: { color: ON_ACCENT, fontSize: 17, fontWeight: '600' },
    hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    hintText: { color: colors.textFaint, fontSize: 13 },
  })
