import { useMemo, useRef } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fonts, useColors } from '@/theme'

type Props = { text: string | null; onClose: () => void }

export function TextSheet({ text, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  // Keeps the text on screen while the sheet slides away after text turns null.
  const shown = useRef('')
  if (text !== null) shown.current = text

  return (
    <Modal
      visible={text !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Выделение текста</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.done}>Готово</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
          <Text selectable style={styles.text}>
            {shown.current}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
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
  title: { color: colors.text, fontSize: 17, fontWeight: '600' },
  done: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  text: { color: colors.text, fontFamily: fonts.prose, fontSize: 17, lineHeight: 27 },
})
