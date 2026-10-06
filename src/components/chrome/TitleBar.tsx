import { StyleSheet, View } from 'react-native'

import { SidebarToggle } from '@/components/chrome/Sidebar'
import { TabBar } from '@/components/chrome/TabBar'
import { Wordmark } from '@/components/visuals/Wordmark'
import { desktopBridge } from '@/lib/ui/desktopChrome'
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
// With `sidebar` it holds, at its left end, the button that folds the sidebar, and the
// tabs in place of the wordmark, as in Obsidian.
export function TitleBar({ sidebar, pathname }: { sidebar: boolean; pathname: string }) {
  const styles = useStyles(createStyles)
  const toggle = <SidebarToggle />
  if (sidebar) {
    return (
      <View style={[styles.root, styles.tabbed, mac ? styles.macTabbed : styles.otherTabbed]} {...dragRegion}>
        <View style={styles.tabbedSide}>{toggle}</View>
        <TabBar pathname={pathname} embedded />
      </View>
    )
  }
  return (
    <View style={[styles.root, mac ? styles.mac : styles.other]} {...dragRegion}>
      <Wordmark width={64} optical />
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
    tabbed: { justifyContent: 'flex-start', alignItems: 'stretch' },
    // Past the traffic lights on a Mac, short of the system buttons elsewhere.
    macTabbed: { paddingLeft: 80, paddingRight: 8 },
    otherTabbed: { paddingLeft: 6, paddingRight: 140 },
    tabbedSide: { justifyContent: 'center', marginRight: 4 },
  })
