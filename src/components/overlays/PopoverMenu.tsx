import { Icon } from '@/components/visuals/Icon'
import { useState, type ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { withAlpha } from '@/lib/core/color'
import * as Haptics from '@/lib/ui/haptics'
import { useColors, useStyles, type Colors } from '@/theme'

export type PopoverMenuItem = {
  key?: string
  label: string
  icon?: React.ComponentProps<typeof Icon>['name']
  onSelect: () => void
  destructive?: boolean
  accessibleRole?: 'button' | 'menuitem'
}

export type PopoverMenuProps = {
  visible: boolean
  onClose: () => void
  items?: PopoverMenuItem[]
  children?: ReactNode
  // Position and transform anchor of the menu container.
  style?: StyleProp<ViewStyle>
  // Custom styles for the GlassSurface body.
  bodyStyle?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

export function usePopoverMenu() {
  const [visible, setVisible] = useState(false)
  const open = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setVisible(true)
  }
  const close = () => setVisible(false)
  const toggle = () => (visible ? close() : open())
  return { visible, open, close, toggle, setVisible }
}

/**
 * A floating glass menu that pops up with a spring animation and dismisses via backdrop or item selection.
 * Used for custom popup menus that shouldn't use the system modal menu (e.g. create character menu, chat attach menu).
 */
export function PopoverMenu({
  visible,
  onClose,
  items,
  children,
  style,
  bodyStyle,
  accessibilityLabel = 'Close',
}: PopoverMenuProps) {
  const colors = useColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)

  const [mounted, setMounted] = useState(visible)
  const pop = useSharedValue(visible ? 1 : 0)

  // Sync mounted state and animate spring/timing on visibility changes.
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) {
      setMounted(true)
      pop.value = withSpring(1, { damping: 20, stiffness: 300, mass: 0.7 })
    } else {
      pop.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(setMounted, false)
      })
    }
  }

  const menuStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }))

  if (!mounted) return null

  return (
    <>
      {visible ? (
        <Pressable
          style={styles.backdrop}
          onPressIn={onClose}
          accessibilityLabel={accessibilityLabel}
        />
      ) : null}
      <Animated.View style={[styles.menu, style, menuStyle]}>
        <GlassSurface style={[styles.menuBody, bodyStyle]} fallbackStyle={glass.solid}>
          {children}
          {items?.map((item, index) => (
            <Pressable
              key={item.key ?? item.label ?? index}
              onPress={() => {
                onClose()
                item.onSelect()
              }}
              accessibilityRole={item.accessibleRole ?? 'button'}
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: withAlpha(colors.text, 0.1) },
              ]}
            >
              {item.icon ? (
                <Icon
                  name={item.icon}
                  size={20}
                  color={item.destructive ? colors.danger : colors.text}
                />
              ) : null}
              <Text
                style={[
                  styles.menuLabel,
                  item.destructive && { color: colors.danger },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </GlassSurface>
      </Animated.View>
    </>
  )
}

export function PopoverMenuDivider({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles(createStyles)
  return <Animated.View style={[styles.rule, style]} />
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 90,
    },
    menu: {
      position: 'absolute',
      zIndex: 100,
    },
    menuBody: {
      borderRadius: 24,
      borderCurve: 'continuous',
      padding: 6,
      minWidth: 220,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 18,
      borderCurve: 'continuous',
    },
    menuLabel: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '500',
    },
    rule: {
      height: 1,
      marginHorizontal: 8,
      marginVertical: 4,
      backgroundColor: colors.border,
    },
  })
