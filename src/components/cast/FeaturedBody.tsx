import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useStyles, type Colors } from '@/theme'

type Props = {
  name: string
  count?: string | null
  preview: string
}

// The text under the picture of a card that fills the screen. The preview gets as many
// lines as the room left under the name really holds (measured), so it ends with an
// ellipsis instead of being cut through a line by the edge of the card.
export function FeaturedBody({ name, count, preview }: Props) {
  const styles = useStyles(createStyles)
  const [lines, setLines] = useState(1)
  return (
    <View style={styles.body}>
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {count ? <Text style={styles.count}>{count}</Text> : null}
      </View>
      <View
        style={styles.room}
        onLayout={(e) => setLines(Math.max(1, Math.floor(e.nativeEvent.layout.height / LINE_HEIGHT)))}
      >
        <Text style={styles.preview} numberOfLines={lines}>
          {preview}
        </Text>
      </View>
    </View>
  )
}

const LINE_HEIGHT = 19

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    body: { flex: 1, padding: 16 },
    nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 },
    name: { flexShrink: 1, color: colors.text, fontSize: 20, fontWeight: '600' },
    count: { color: colors.textFaint, fontSize: 13 },
    // Takes what is left; the text inside never makes it grow, so the measure is stable.
    room: { flex: 1, overflow: 'hidden' },
    preview: { color: colors.textMuted, fontSize: 14, lineHeight: LINE_HEIGHT },
  })
