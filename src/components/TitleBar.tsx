import { StyleSheet, Text, View } from 'react-native'

import { IconButton } from '@/components/IconButton'
import { toggleSidebar, useSidebarCollapsed } from '@/components/Sidebar'
import { t } from '@/i18n'
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
// With `sidebar` it holds, at its left end, the button that folds the sidebar.
export function TitleBar({ title, sidebar }: { title: string; sidebar: boolean }) {
  const styles = useStyles(createStyles)
  const collapsed = useSidebarCollapsed()
  return (
    <View style={[styles.root, mac ? styles.mac : styles.other]} {...dragRegion}>
      <View style={[styles.side, mac && styles.macSide]}>
        {sidebar ? (
          <IconButton
            name="reorder-two-outline"
            size={18}
            style={styles.toggle}
            onPress={toggleSidebar}
            accessibilityLabel={t(collapsed ? 'sidebar.expand' : 'sidebar.collapse')}
          />
        ) : null}
      </View>
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
    // The left end, outside the centered title; past the traffic lights on a Mac.
    side: { position: 'absolute', left: 6, top: 0, bottom: 0, justifyContent: 'center' },
    macSide: { left: 80 },
    toggle: { width: 28, height: 28 },
    title: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
  })
