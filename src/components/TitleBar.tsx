import { StyleSheet, Text, View } from 'react-native'

import { desktopBridge } from '@/lib/desktopChrome'
import { type Colors, useStyles } from '@/theme'

// Kept the same as TITLE_BAR_HEIGHT in electron/main.js, where the system buttons are sized.
export const TITLE_BAR_HEIGHT = 36

// react-native-web turns dataSet into data- attributes; the stylesheet of desktopChrome
// makes that one the region the window is dragged by. RN's types don't know the prop.
const dragRegion = { dataSet: { titlebar: 'drag' } } as object

const mac = desktopBridge()?.platform === 'darwin'

// The desktop window has no system frame, so the page draws the bar the window is dragged
// by, in the sidebar's grey. The system buttons sit over one end of it:
// the traffic lights on the left on a Mac, the overlay on the right elsewhere.
export function TitleBar({ title }: { title: string }) {
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.root, mac ? styles.mac : styles.other]} {...dragRegion}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: {
      height: TITLE_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    mac: { paddingLeft: 80, paddingRight: 80 },
    other: { paddingLeft: 140, paddingRight: 140 },
    title: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
  })
