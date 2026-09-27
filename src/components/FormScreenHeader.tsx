import { Stack, useRouter } from 'expo-router'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTranslation } from '@/i18n'
import { fonts, HEADER_ROW_HEIGHT, useColors, useStyles, type Colors } from '@/theme'

import { EdgeFade } from './BarChrome'
import { GlassButton } from './Glass'
import { useHeaderHeight } from './GlassHeader'
import { Star } from './motifs/Star'
import { SFIcon } from './SFIcon'

const ON_ACCENT = '#FFFFFF'

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
export function DrawnFormScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const router = useRouter()
  const { t } = useTranslation()
  const styles = useStyles(createStyles)
  return (
    <>
      <EdgeFade edge="top" style={[styles.fade, { height: headerHeight + 28 }]} />
      <View style={[styles.bar, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View style={styles.row} pointerEvents="box-none">
          <BarButton symbol="chevron.backward" fallback="chevron-back" onPress={() => router.back()} accessibilityLabel={t('common.back')} />
          <View style={styles.titleSlot} pointerEvents="none">
            <FormTitle title={title} />
          </View>
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
}

// A bar button of the drawn header: an SF Symbol in the text color, like every other
// glass button in the app, or white on the accent when prominent.
export function BarButton({ symbol, fallback, onPress, disabled, accessibilityLabel, prominent = false }: BarButtonProps) {
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
      <SFIcon name={symbol} fallback={fallback} size={19} color={filled ? ON_ACCENT : colors.text} onAccent={filled} />
    </GlassButton>
  )
}

function FormTitle({ title }: { title: string }) {
  const titleMaxWidth = useWindowDimensions().width - 160
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.titleRow, { maxWidth: titleMaxWidth }]}>
      <Star size={22} color={colors.danger} rotation={-14} style={styles.star} />
      <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
        {title}
      </Text>
    </View>
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
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    star: { marginTop: 2 },
    title: { color: colors.text, fontFamily: fonts.prose, fontWeight: '700', fontSize: 28, flexShrink: 1 },
  })
