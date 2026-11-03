import { Icon } from '@/components/visuals/Icon'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/ui/haptics'
import { type Colors, CONTROL_FONT_SCALE, useColors, useStyles } from '@/theme'
import { useEffect, type ComponentProps } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useKeyboardState } from 'react-native-keyboard-controller'
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import type { EdgeInsets } from 'react-native-safe-area-context'

export const ANDROID_TAB_BAR_HEIGHT = 60
const INDICATOR_WIDTH = 56
const INDICATOR_HEIGHT = 32
const EXPAND_MS = 220

export function getAndroidTabBarBottom(insetsBottom: number) {
  return Math.max(12, insetsBottom + 8)
}

export function getAndroidTabBarSpace(insetsBottom: number) {
  return getAndroidTabBarBottom(insetsBottom) + ANDROID_TAB_BAR_HEIGHT
}

type TabConfig = {
  labelKey: string
  icon: ComponentProps<typeof Icon>['name']
  iconActive: ComponentProps<typeof Icon>['name']
}

const TAB_CONFIG: Record<string, TabConfig> = {
  index: { labelKey: 'characters.title', icon: 'people-outline', iconActive: 'people' },
  rooms: { labelKey: 'rooms.title', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  settings: { labelKey: 'settings.title', icon: 'settings-outline', iconActive: 'settings' },
  search: { labelKey: 'search.title', icon: 'search-outline', iconActive: 'search' },
}

type TabBarProps = {
  state: {
    index: number
    routes: { key: string; name: string }[]
  }
  descriptors: Record<string, { options: { title?: string } }>
  emitter: {
    emit: (options: any) => any
  }
  navigateToTab: (routeKey: string) => void
  insets: EdgeInsets
  bottom?: number
  sideInsets?: EdgeInsets
}

export function AndroidFloatingTabBar({ state, emitter, navigateToTab, insets, bottom, sideInsets }: TabBarProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const isKeyboardVisible = useKeyboardState((s) => s.isVisible)

  if (isKeyboardVisible) return null

  const effectiveInsets = sideInsets ?? insets
  const bottomOffset = bottom ?? getAndroidTabBarBottom(effectiveInsets.bottom)

  return (
    <View
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          left: Math.max(16, effectiveInsets.left + 8),
          right: Math.max(16, effectiveInsets.right + 8),
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.capsule}>
        {state.routes.map((route, index) => {
          const config = TAB_CONFIG[route.name]
          if (!config) return null

          const isFocused = state.index === index
          const label = t(config.labelKey)

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })

            if (!isFocused && !event?.defaultPrevented) {
              navigateToTab(route.key)
            }
            Haptics.selectionAsync()
          }

          const onLongPress = () => {
            emitter.emit({
              type: 'tabLongPress',
              target: route.key,
            })
          }

          return (
            <AndroidTabItem
              key={route.key}
              isFocused={isFocused}
              label={label}
              icon={config.icon}
              iconActive={config.iconActive}
              onPress={onPress}
              onLongPress={onLongPress}
              accentColor={colors.accent}
              accentSoftColor={colors.accentSoft}
              textMutedColor={colors.textMuted}
              styles={styles}
            />
          )
        })}
      </View>
    </View>
  )
}

function AndroidTabItem({
  isFocused,
  label,
  icon,
  iconActive,
  onPress,
  onLongPress,
  accentColor,
  accentSoftColor,
  textMutedColor,
  styles,
}: {
  isFocused: boolean
  label: string
  icon: ComponentProps<typeof Icon>['name']
  iconActive: ComponentProps<typeof Icon>['name']
  onPress: () => void
  onLongPress: () => void
  accentColor: string
  accentSoftColor: string
  textMutedColor: string
  styles: ReturnType<typeof createStyles>
}) {
  const width = useSharedValue(isFocused ? INDICATOR_WIDTH : 0)

  useEffect(() => {
    width.value = withTiming(isFocused ? INDICATOR_WIDTH : 0, {
      duration: EXPAND_MS,
      easing: Easing.out(Easing.cubic),
    })
  }, [isFocused, width])

  const indicatorStyle = useAnimatedStyle(() => ({
    width: width.value,
    opacity: interpolate(width.value, [0, 8], [0, 1], 'clamp'),
  }))

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      style={styles.tabItem}
    >
      <View style={styles.iconContainer}>
        <Animated.View
          style={[
            styles.indicatorBackground,
            { backgroundColor: accentSoftColor },
            indicatorStyle,
          ]}
        />
        <Icon
          name={isFocused ? iconActive : icon}
          size={21}
          color={isFocused ? accentColor : textMutedColor}
        />
      </View>
      <Text
        maxFontSizeMultiplier={CONTROL_FONT_SCALE}
        style={[styles.label, isFocused && { color: accentColor, fontWeight: '600' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      maxWidth: 520,
      alignSelf: 'center',
      zIndex: 100,
    },
    capsule: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      height: ANDROID_TAB_BAR_HEIGHT,
      borderRadius: ANDROID_TAB_BAR_HEIGHT / 2,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      overflow: 'hidden',
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      paddingVertical: 4,
    },
    iconContainer: {
      width: INDICATOR_WIDTH,
      height: INDICATOR_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    indicatorBackground: {
      position: 'absolute',
      height: INDICATOR_HEIGHT,
      borderRadius: INDICATOR_HEIGHT / 2,
      borderCurve: 'continuous',
      overflow: 'hidden',
    },
    label: {
      fontSize: 10.5,
      fontWeight: '500',
      color: colors.textMuted,
      marginTop: 2,
      letterSpacing: 0.1,
    },
  })
