import { Icon } from '@/components/visuals/Icon'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'

import { ON_ACCENT, useColors, useStyles, type Colors } from '@/theme'
import type { CheckProps } from './types'

export function Check({ on }: CheckProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(on ? 1 : 0.8, { duration: 150 }) }],
    opacity: withTiming(on ? 1 : 0, { duration: 150 }),
  }))

  return (
    <View style={[styles.box, on ? styles.checked : styles.unchecked]}>
      <Animated.View style={[styles.checkIcon, animatedStyle]}>
        <Icon name="checkmark" size={14} color={ON_ACCENT} />
      </Animated.View>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    box: {
      width: 20,
      height: 20,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checked: {
      backgroundColor: colors.accent,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    unchecked: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: colors.borderStrong,
    },
    checkIcon: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
