import { StyleSheet, View } from 'react-native'

import { useStyles, type Colors } from '@/theme'

export function Divider() {
  const styles = useStyles(createStyles)
  return <View style={styles.divider} />
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 26 },
  })
