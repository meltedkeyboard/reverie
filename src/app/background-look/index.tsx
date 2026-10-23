import { useNavigation } from 'expo-router'
import { useEffect, useLayoutEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Chip } from '@/components/controls/Chip'
import { NativeMenu } from '@/components/overlays/NativeMenu'
import { SFIcon } from '@/components/visuals/SFIcon'
import { ParamSlider } from '@/components/controls/ParamSlider'
import { Segmented } from '@/components/controls/Segmented'
import { useStore } from '@/components/chat/thread/store'
import { useSheetTones } from '@/components/overlays/BottomSheet'
import { useTranslation } from '@/i18n'
import { backgroundLook, lookSheetDown, setLookSheetOpen } from '@/lib/images/backgroundLook'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

// Far enough to take the controls out of the strip under the bar of the sheet let down.
const HIDE_BY = 160

const percent = (value: number) => `${Math.round(value * 100)}%`

// The screen of the sheet: the effect on top, where the sheet let down still shows it, then
// the sliders and the chat's colors in cards, as the attach menu lays out its rows, and Save
// across the foot. Close and the reset of the frame are on the bar.
export default function BackgroundLookScreen() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const tones = useSheetTones({ noGlass: true })
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const look = useStore(backgroundLook)

  useEffect(() => {
    lookSheetDown.set(false)
    setLookSheetOpen(true)
    return () => setLookSheetOpen(false)
  }, [])

  // Let down, only the bar shows: the rest slides down out of the strip above the home
  // indicator. Moved, not faded: Liquid Glass (the bar's buttons, a glass chip) does not
  // render under a parent with opacity.
  const down = useStore(lookSheetDown)
  const hidden = useSharedValue(0)
  useEffect(() => {
    hidden.value = withTiming(down ? 1 : 0, { duration: 220 })
  }, [down, hidden])
  const shownStyle = useAnimatedStyle(() => ({ transform: [{ translateY: hidden.value * HIDE_BY }] }))

  const framed = !!look?.framed
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('background.title'),
      unstable_headerLeftItems: () => [
        {
          type: 'button',
          label: t('common.close'),
          icon: { type: 'sfSymbol', name: 'xmark' },
          onPress: () => backgroundLook.get()?.close(),
        },
      ],
      unstable_headerRightItems: () =>
        framed
          ? [
              {
                type: 'button',
                label: t('background.reset'),
                icon: { type: 'sfSymbol', name: 'arrow.counterclockwise' },
                onPress: () => backgroundLook.get()?.reset(),
              },
            ]
          : [],
    })
  }, [navigation, t, framed])

  if (!look) return null
  const { effect, setEffect } = look

  // Dim opens a menu of the color it lays over the picture: the theme's, light or dark.
  const dimItems = (['dim', 'dim-light', 'dim-dark'] as const).map((value) => ({
    label: t(value === 'dim' ? 'background.dimTheme' : value === 'dim-light' ? 'background.dimLight' : 'background.dimDark'),
    systemImage: effect === value ? 'checkmark' : undefined,
    onSelect: () => setEffect(value),
  }))
  const toneOptions = [
    { value: 'auto' as const, label: t('background.toneAuto') },
    { value: 'light' as const, label: t('background.toneLight') },
    { value: 'dark' as const, label: t('background.toneDark') },
  ]

  return (
    // No scroll view: everything fits, and a drag anywhere on the sheet moves the sheet.
    <Animated.View style={[styles.content, { paddingBottom: insets.bottom + 16 }, shownStyle]} pointerEvents={down ? 'none' : 'auto'}>
      {/* Two chips always fit, so a plain row and not ChipGroup: its sideways scroll view,
          inside the sheet, was laid out past the sheet's left edge. */}
      <View style={styles.chips}>
        <Chip label={t('background.effectBlur')} active={effect === 'blur'} onPress={() => setEffect('blur')} style={styles.chip} />
        <NativeMenu items={dimItems} style={styles.chip}>
          <Chip label={t('background.effectDim')} active={effect !== 'blur'} onPress={() => {}} style={styles.inMenu} />
        </NativeMenu>
      </View>

      <View style={[styles.card, styles.sliders, { backgroundColor: tones.card }]}>
        <ParamSlider
          label={t('background.intensity')}
          value={look.intensity}
          min={0}
          max={1}
          step={0.01}
          formatValue={percent}
          onChange={look.setIntensity}
        />
        <View style={[styles.separator, { backgroundColor: colors.borderStrong }]} />
        <ParamSlider
          label={t('background.bubbleTransparency')}
          value={look.bubbleTransparency}
          min={0}
          max={1}
          step={0.05}
          formatValue={percent}
          onChange={look.setBubbleTransparency}
        />
      </View>

      {/* Whether the chat over the picture is light or dark: measured, or the user's own choice. */}
      <View style={[styles.card, styles.tone, { backgroundColor: tones.card }]}>
        <Text style={styles.label}>{t('background.tone')}</Text>
        <Segmented options={toneOptions} value={look.tone} onChange={look.setTone} />
      </View>

      {/* Across the foot, as the attach menu's button. */}
      <Pressable
        onPress={look.save}
        disabled={look.saving}
        accessibilityRole="button"
        accessibilityLabel={t('common.save')}
        style={({ pressed }) => [styles.save, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.saveText}>{t('common.save')}</Text>
      </Pressable>
      <View style={styles.hint}>
        <SFIcon name="crop" fallback="crop-outline" size={15} color={colors.textFaint} />
        <Text style={styles.hintText}>{t('background.cropHint')}</Text>
      </View>
    </Animated.View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
    chips: { flexDirection: 'row', gap: 8 },
    chip: { flex: 1 },
    // The menu centers its label, so the chip is stretched back to the menu's width.
    inMenu: { alignSelf: 'stretch' },
    card: { borderRadius: 24, overflow: 'hidden' },
    sliders: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    separator: { height: StyleSheet.hairlineWidth, marginBottom: 12 },
    tone: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
    label: { color: colors.text, fontSize: 17 },
    save: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    saveText: { color: ON_ACCENT, fontSize: 17, fontWeight: '600' },
    hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    hintText: { color: colors.textFaint, fontSize: 13 },
  })
