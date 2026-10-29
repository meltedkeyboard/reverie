import { StyleSheet, Text, View } from 'react-native'

import { Icon } from '@/components/visuals/Icon'
import { type Colors, ON_ACCENT, useStyles } from '@/theme'

// The mark in the corner of a ticked picture: the same accent bubble wherever pictures are
// picked, the attach menu's row, its gallery and the sheet a generator takes pictures from.
// With an order it says where the picture stands among the ones picked; without one, where
// only one is picked, it is a checkmark.
export function OrderBadge({ order }: { order?: number }) {
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.badge, order === undefined && styles.round]} pointerEvents="none">
      {order === undefined ? (
        <Icon name="checkmark" size={14} color={ON_ACCENT} />
      ) : (
        <Text style={styles.order}>{order}</Text>
      )}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    badge: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 24,
      height: 24,
      paddingHorizontal: 6,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: '#fff',
      backgroundColor: colors.accent,
    },
    // The padding is room for a number of two digits; a checkmark is a circle.
    round: { width: 24, paddingHorizontal: 0 },
    order: { color: ON_ACCENT, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  })
