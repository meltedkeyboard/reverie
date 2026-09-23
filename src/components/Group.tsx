import { Children, Fragment } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { useStyles, type Colors } from '@/theme'

// A rounded card of rows, as in iOS settings, with a hairline between them.
export function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.card, style]}>
      {Children.toArray(children).map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={styles.separator} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  })
