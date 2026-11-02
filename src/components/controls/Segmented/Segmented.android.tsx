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
              !isFirst && styles.segmentBorderLeft,
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
              style={[styles.segment, chosen && styles.chosen]}
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
      borderRadius: 20,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
    },
    segmentWrap: {
      flex: 1,
      height: '100%',
    },
    segmentBorderLeft: {
      borderLeftWidth: 1,
      borderLeftColor: colors.borderStrong,
    },
    firstSegment: {
      borderTopLeftRadius: 18,
      borderBottomLeftRadius: 18,
    },
    lastSegment: {
      borderTopRightRadius: 18,
      borderBottomRightRadius: 18,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    chosen: {
      backgroundColor: colors.accent,
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
