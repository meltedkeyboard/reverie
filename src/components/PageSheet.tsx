import { Modal, StyleSheet, Text, View } from 'react-native'

import { useStyles, type Colors } from '@/theme'

type Props = {
  visible: boolean
  onClose: () => void
  title: string
  // Header buttons; with nothing on the left the title sits at the start.
  left?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
}

// A modal page sheet with a title bar, swipe-to-dismiss on iOS.
export function PageSheet({ visible, onClose, title, left, right, children }: Props) {
  const styles = useStyles(createStyles)
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          {left !== undefined ? <View style={styles.side}>{left}</View> : null}
          <Text style={styles.title}>{title}</Text>
          <View style={[styles.side, styles.sideRight]}>{right}</View>
        </View>
        {children}
      </View>
    </Modal>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    side: { minWidth: 80 },
    sideRight: { alignItems: 'flex-end' },
    title: { color: colors.text, fontSize: 17, fontWeight: '600' },
  })
