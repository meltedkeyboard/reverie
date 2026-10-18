import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTranslation } from '@/i18n'
import { type Colors, HEADER_ROW_HEIGHT, ON_ACCENT, useColors, useStyles } from '@/theme'

import { EdgeFade } from './BarChrome'
import { GlassButton } from './Glass'
import { TAB_TITLE_STAR_ROOM, TabTitle, useHeaderHeight } from './GlassHeader'
import { SFIcon } from '../visuals/SFIcon'


// The transparent native header of a form-style screen: a red star and a title on the
// left, with the content fading out underneath. Rendered inside the screen it belongs to.
export function FormScreenHeader({ title }: { title: string }) {
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <>
      <EdgeFade edge="top" style={[styles.fade, { height: headerHeight + 28 }]} />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          // Like the glass buttons everywhere else, not the accent the navigation theme tints with.
          headerTintColor: colors.text,
          headerBackButtonDisplayMode: 'minimal',
          headerTitleAlign: 'left',
          headerTitle: () => <FormTitle title={title} />,
        }}
      />
    </>
  )
}

// The same header drawn by the screen itself, for iOS screens opened with Link.AppleZoom.
// With a native bar there, a swipe back that is started and then cancelled leaves the
// screen without it: the header-less screen underneath hides the bar as the swipe begins,
// and after a zoom transition nothing shows it again. Laid out like the native one: a
// Liquid Glass back button, the title centered, the actions on the right.
//
// overPhoto, from 0 to 1, is how far a photo has spread under the header (the character
// editor's avatar): the fade gives way to it, while the glass buttons stay, since Liquid
// Glass renders wrongly under a fading parent. The title gives way too, or, with nameSpot,
// moves down onto the photo and turns white, as the name in a Telegram profile does.
export function DrawnFormScreenHeader({
  title,
  right,
  overPhoto,
  nameSpot,
}: {
  title: string
  right?: React.ReactNode
  overPhoto?: SharedValue<number>
  nameSpot?: NameSpot
}) {
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const router = useRouter()
  const { t } = useTranslation()
  const styles = useStyles(createStyles)
  const giveWay = useAnimatedStyle(() => ({ opacity: overPhoto ? 1 - overPhoto.value : 1 }))
  return (
    <>
      <Animated.View style={[styles.fade, { height: headerHeight + 28 }, giveWay]}>
        <EdgeFade edge="top" style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={[styles.bar, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View
          style={[
            styles.row,
            {
              paddingLeft: Math.max(16, insets.left + 8),
              paddingRight: Math.max(16, insets.right + 8),
            },
          ]}
          pointerEvents="box-none"
        >
          <BarButton symbol="chevron.backward" fallback="chevron-back" onPress={() => router.back()} accessibilityLabel={t('common.back')} />
          {overPhoto && nameSpot ? (
            <View style={styles.titleSlot} pointerEvents="none">
              <MovingTitle title={title} progress={overPhoto} spot={nameSpot} />
            </View>
          ) : (
            <Animated.View style={[styles.titleSlot, giveWay]} pointerEvents="none">
              <FormTitle title={title} />
            </Animated.View>
          )}
          {right}
        </View>
      </View>
    </>
  )
}

type BarButtonProps = {
  symbol: React.ComponentProps<typeof SFIcon>['name']
  fallback: React.ComponentProps<typeof SFIcon>['fallback']
  // Optional because a Link with asChild injects its own onPress.
  onPress?: () => void
  disabled?: boolean
  accessibilityLabel?: string
  // The confirming action (the checkmark that saves): filled with the brand color.
  prominent?: boolean
  // A change of `symbol` plays the system Replace transition, for a button that turns
  // into another one in place.
  animateChange?: boolean
}

// A bar button of the drawn header: an SF Symbol in the text color, like every other
// glass button in the app, or white on the accent when prominent.
export function BarButton({ symbol, fallback, onPress, disabled, accessibilityLabel, prominent = false, animateChange }: BarButtonProps) {
  const colors = useColors()
  const filled = prominent && !disabled
  return (
    <GlassButton
      icon={fallback}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      tint={prominent ? colors.accent : undefined}
    >
      <SFIcon name={symbol} fallback={fallback} size={19} color={filled ? ON_ACCENT : colors.text} onAccent={filled} animateChange={animateChange} />
    </GlassButton>
  )
}

// Where the name lies on the open photo, in screen points: its left edge, and the bottom of
// its line with the page unscrolled. The photo moves with the scroll, and the name with it.
export type NameSpot = { left: number; bottom: number; scrollY: SharedValue<number> }

// The title, carried from the middle of the header to the bottom left of the photo as it
// spreads. A white copy over it comes in on the way; the star goes out, the photo has none.
function MovingTitle({ title, progress, spot }: { title: string; progress: SharedValue<number>; spot: NameSpot }) {
  const insets = useSafeAreaInsets()
  const titleMaxWidth = useWindowDimensions().width - 160 - insets.left - insets.right
  // Where the title stands in the header row, for the way down from there.
  const [from, setFrom] = useState<{ x: number; y: number; height: number } | null>(null)

  const move = useAnimatedStyle(() => {
    if (!from) return {}
    const k = progress.value
    const dx = spot.left - TAB_TITLE_STAR_ROOM - from.x
    // The open photo doesn't follow the page below the top (pinOpen of ExpandingAvatar).
    const scrolled = spot.scrollY.value - Math.min(0, spot.scrollY.value) * k
    const dy = spot.bottom - scrolled - from.height - (insets.top + from.y)
    return { transform: [{ translateX: dx * k }, { translateY: dy * k }] }
  })
  const star = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 0.4], [1, 0], 'clamp') }))
  const white = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.2, 0.9], [0, 1], 'clamp') }))
  const hidden = { opacity: 0 }

  return (
    <Animated.View
      style={move}
      onLayout={(e) => {
        const { x, y, height } = e.nativeEvent.layout
        setFrom({ x, y, height })
      }}
    >
      <TabTitle maxWidth={titleMaxWidth} fit starStyle={star}>
        {title}
      </TabTitle>
      <Animated.View style={[StyleSheet.absoluteFill, white]}>
        <TabTitle maxWidth={titleMaxWidth} fit color={ON_ACCENT} starStyle={hidden}>
          {title}
        </TabTitle>
      </Animated.View>
    </Animated.View>
  )
}

function FormTitle({ title }: { title: string }) {
  const insets = useSafeAreaInsets()
  const titleMaxWidth = useWindowDimensions().width - 160 - insets.left - insets.right
  return (
    <TabTitle maxWidth={titleMaxWidth} fit>
      {title}
    </TabTitle>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    fade: { pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0 },
    bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    row: {
      height: HEADER_ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
    },
    // Centered on the whole bar like a native title view, not on the room between buttons.
    titleSlot: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  })
