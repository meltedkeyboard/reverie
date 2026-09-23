import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { fonts, useStyles, type Colors } from '@/theme'

// The "R" tile standing in for the app icon on the welcome and about screens.
export function AppMark({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.mark, style]}>
      <Text style={styles.glyph}>R</Text>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    mark: {
      alignSelf: 'center',
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glyph: { color: colors.accent, fontFamily: fonts.prose, fontSize: 32, fontWeight: '600' },
  })
