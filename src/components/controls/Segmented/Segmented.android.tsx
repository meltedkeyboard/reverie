import { Pressable, StyleSheet, Text, View } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { type Colors, ON_ACCENT, useStyles } from '@/theme'
import type { SegmentedProps } from './types'

const HEIGHT = 40

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const styles = useStyles(createStyles)

  return (
    <View style={styles.group} accessibilityRole="radiogroup">
      {options.map((option, index) => {
        const chosen = option.value === value
        const isFirst = index === 0
        const isLast = index === options.length - 1

        return (
          <View
            key={option.value}
            style={[
              styles.segmentWrap,
              isFirst && styles.firstSegment,
              isLast && styles.lastSegment,
              !isFirst && styles.notFirstSegment,
              chosen ? styles.chosenWrap : styles.unselectedWrap,
            ]}
          >
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              onPress={() => {
                if (chosen) return
                Haptics.selectionAsync()
                onChange(option.value)
              }}
              android_ripple={{
                color: chosen ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                borderless: false,
              }}
              style={styles.segment}
            >
              <Text
                style={[styles.label, chosen && styles.chosenLabel]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          </View>
        )
      })}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    group: {
      flexDirection: 'row',
      height: HEIGHT,
    },
    segmentWrap: {
      flex: 1,
      height: '100%',
      borderWidth: 2,
      overflow: 'hidden',
    },
    firstSegment: {
      borderTopLeftRadius: HEIGHT / 2,
      borderBottomLeftRadius: HEIGHT / 2,
    },
    lastSegment: {
      borderTopRightRadius: HEIGHT / 2,
      borderBottomRightRadius: HEIGHT / 2,
    },
    notFirstSegment: {
      marginLeft: -2,
    },
    unselectedWrap: {
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceRaised,
      zIndex: 1,
    },
    chosenWrap: {
      borderColor: colors.accent,
      backgroundColor: colors.accent,
      zIndex: 2,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    label: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    chosenLabel: {
      color: ON_ACCENT,
      fontWeight: '600',
    },
  })
