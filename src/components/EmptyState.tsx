import { StyleSheet, Text, View } from 'react-native'

import { FEATURED_GAP } from '@/lib/featuredLayout'
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

// The primary button of an empty list.
export const emptyButtonStyle = { minWidth: 200 }

// The gap between cards while the continue button is shown above the list.
export function FeaturedSeparator() {
  return <View style={{ height: FEATURED_GAP }} />
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
