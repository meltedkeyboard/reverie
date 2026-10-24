import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTranslation } from '@/i18n'
import { isDesktop } from '@/lib/core/platform'
import { type Colors, HEADER_ROW_HEIGHT, ON_ACCENT, useColors, useStyles } from '@/theme'

import { EdgeFade } from './BarChrome'
import { GlassButton } from './Glass'
import { TAB_TITLE_STAR, TAB_TITLE_STAR_ROOM, TabTitle, useHeaderHeight } from './GlassHeader'
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
// moves down onto the photo and turns white, as the name in a Telegram profile does. With
// the page's scrollY and its avatar, the avatar comes up into the header in place of the
// star as the page is scrolled past it, and goes back down with the page.
export function DrawnFormScreenHeader({
  title,
  right,
  overPhoto,
  scrollY,
  nameSpot,
  avatar,
  clearAtTop = false,
  fadeRgb,
}: {
  title: string
  right?: React.ReactNode
  overPhoto?: SharedValue<number>
  scrollY?: SharedValue<number>
  nameSpot?: NameSpot
  avatar?: PageAvatar
  // The fade under the bar comes in only as the page scrolls under it, so what the page
  // draws at its very top (the profile's glow) shows through while it is unscrolled.
  clearAtTop?: boolean
  // The color the fade under the bar takes, as "r, g, b", in place of the page's.
  fadeRgb?: string
}) {
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const router = useRouter()
  const { t } = useTranslation()
  const styles = useStyles(createStyles)
  const giveWay = useAnimatedStyle(() => ({ opacity: overPhoto ? 1 - overPhoto.value : 1 }))
  const fadeShown = useAnimatedStyle(() => {
    const shown = overPhoto ? 1 - overPhoto.value : 1
    return { opacity: clearAtTop && scrollY ? shown * interpolate(scrollY.value, [0, FADE_IN], [0, 1], 'clamp') : shown }
  })
  return (
    <>
      <Animated.View style={[styles.fade, { height: headerHeight + 28 }, fadeShown]}>
        <EdgeFade edge="top" rgb={fadeRgb} style={StyleSheet.absoluteFill} />
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
          {overPhoto && scrollY ? (
            <View style={styles.titleSlot} pointerEvents="none">
              <MovingTitle title={title} progress={overPhoto} scrollY={scrollY} spot={nameSpot} avatar={avatar} />
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
export type NameSpot = { left: number; bottom: number }

// The round avatar at the top of the page, drawn again by the header: `node` at `size`,
// centered at centerX, centerY on the screen with the page unscrolled. The page hides its
// own while the header's is up (useAvatarHandOff).
export type PageAvatar = { node: React.ReactNode; size: number; centerX: number; centerY: number }

const HEADER_AVATAR = isDesktop ? 24 : 30
// With clearAtTop, the page scrolls this far before the fade under the bar is fully in.
const FADE_IN = 40

// Whether the header holds the avatar: once the page is scrolled down with the photo
// closed. Up to there the two lie on each other, so the hand-off doesn't show.
function avatarInHeader(progress: number, scrollY: number) {
  'worklet'
  return progress === 0 && scrollY > 0
}

// For the page's own avatar: gone while the header holds it.
export function useAvatarHandOff(progress: SharedValue<number>, scrollY: SharedValue<number>) {
  return useAnimatedStyle(() => ({ opacity: avatarInHeader(progress.value, scrollY.value) ? 0 : 1 }))
}

// The title, carried from the middle of the header to the bottom left of the photo as it
// spreads (or only giving way to it, without a spot). A white copy over it comes in on the
// way; the star goes out, the photo has none. Scrolled down, the avatar of the page rides
// up with it, shrinking, onto the star's place and over it.
function MovingTitle({
  title,
  progress,
  scrollY,
  spot,
  avatar,
}: {
  title: string
  progress: SharedValue<number>
  scrollY: SharedValue<number>
  spot?: NameSpot
  avatar?: PageAvatar
}) {
  const insets = useSafeAreaInsets()
  const titleMaxWidth = useWindowDimensions().width - 160 - insets.left - insets.right
  // Where the title stands in the header row, for the way down from there.
  const [from, setFrom] = useState<{ x: number; y: number; height: number } | null>(null)
  // The middle of the star on the screen, where the avatar ends up.
  const starX = from ? from.x + TAB_TITLE_STAR / 2 : 0
  // The star sits 2 pt low in its row.
  const starY = from ? insets.top + from.y + from.height / 2 + 1 : 0
  // Only numbers go into the worklets below: the avatar's node is a React element, which
  // can't be copied to the UI thread.
  const hasAvatar = avatar !== undefined
  const avatarSize = avatar?.size ?? 1
  const centerX = avatar?.centerX ?? 0
  const centerY = avatar?.centerY ?? 0
  const ready = from !== null

  const move = useAnimatedStyle(() => {
    const k = progress.value
    if (!spot) return { opacity: 1 - k }
    if (!from) return {}
    // The open photo doesn't follow the page below the top (pinOpen of ExpandingAvatar).
    const scrolled = scrollY.value - Math.min(0, scrollY.value) * k
    const dx = spot.left - TAB_TITLE_STAR_ROOM - from.x
    const dy = spot.bottom - scrolled - from.height - (insets.top + from.y)
    return { transform: [{ translateX: dx * k }, { translateY: dy * k }] }
  })

  // How far the avatar has come up: it moves with the page, shrinking and drawing aside to
  // the star, and stops there once its middle reaches the star's.
  const rise = () => {
    'worklet'
    if (!hasAvatar || !ready) return 0
    return Math.min(1, Math.max(0, scrollY.value) / Math.max(1, centerY - starY))
  }
  const mini = useAnimatedStyle(() => {
    if (!hasAvatar || !ready || !avatarInHeader(progress.value, scrollY.value)) return { opacity: 0 }
    const t = rise()
    const up = Math.min(scrollY.value, centerY - starY)
    return {
      opacity: 1,
      transform: [{ translateX: (starX - centerX) * t }, { translateY: -up }, { scale: 1 + (HEADER_AVATAR / avatarSize - 1) * t }],
    }
  })
  // The photo has no star: it goes out as the photo spreads. Under the avatar it stays.
  const star = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 0.4], [1, 0], 'clamp') }))
  const white = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.2, 0.9], [0, 1], 'clamp') }))
  const hidden = { opacity: 0 }

  return (
    <>
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
        {spot ? (
          <Animated.View style={[StyleSheet.absoluteFill, white]}>
            <TabTitle maxWidth={titleMaxWidth} fit color={ON_ACCENT} starStyle={hidden}>
              {title}
            </TabTitle>
          </Animated.View>
        ) : null}
      </Animated.View>
      {avatar ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: avatar.centerX - avatar.size / 2,
              top: avatar.centerY - insets.top - avatar.size / 2,
              width: avatar.size,
              height: avatar.size,
            },
            mini,
          ]}
        >
          {avatar.node}
        </Animated.View>
      ) : null}
    </>
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
