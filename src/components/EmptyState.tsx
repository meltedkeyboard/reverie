import { StyleSheet, Text, View } from 'react-native'

import { fonts, useStyles, type Colors } from '@/theme'

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{text}</Text>
      {action}
    </View>
  )
}

export function ListSeparator() {
  return <View style={{ height: 10 }} />
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 24 },
    title: { color: colors.text, fontFamily: fonts.prose, fontSize: 22, marginBottom: 8 },
    text: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  })
