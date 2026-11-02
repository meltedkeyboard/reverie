import { Icon } from '@/components/visuals/Icon'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useColors, useStyles, type Colors } from '@/theme'

import { NativeMenu } from '../../overlays/NativeMenu'
import type { PickerBoxProps } from './types'

export function PickerBox({ value, placeholder, items, accessibilityLabel, fallbackStyle }: PickerBoxProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)

  return (
    <NativeMenu items={items}>
      <View style={[styles.container, fallbackStyle]}>
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ text: value }}
          android_ripple={{ color: `${colors.text}1F`, borderless: false }}
          style={styles.box}
        >
          <Text style={[styles.text, !value && styles.placeholder]} numberOfLines={1}>
            {value || placeholder}
          </Text>
          <Icon name="chevron-expand" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </NativeMenu>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      overflow: 'hidden',
      elevation: 1,
    },
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 54,
      paddingHorizontal: 16,
    },
    text: { flex: 1, color: colors.text, fontSize: 16 },
    placeholder: { color: colors.textFaint },
  })
