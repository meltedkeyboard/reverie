import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'

import { useStyles, type Colors } from '@/theme'

import { Shard } from './Shard'

type Props = {
  label: string
  onPress?: () => void
  color?: string
  disabled?: boolean
  loading?: boolean
  flip?: boolean
  style?: StyleProp<ViewStyle>
}

// The shard-outlined button used for every secondary/destructive action: outline in
// the semantic color, bold label in the same color, no fill.
export function ShardButton({ label, onPress, color, disabled, loading, flip, style }: Props) {
  const styles = useStyles(createStyles)
  const tint = color ?? styles.defaultColor.color
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [style, (disabled || loading) && { opacity: 0.5 }, pressed && !disabled && { opacity: 0.7 }]}
    >
      <Shard
        color={tint}
        strokeWidth={2.5}
        rotation={flip ? 1 : -1}
        style={flip ? { transform: [{ scaleX: -1 }, { rotate: '1deg' }] } : undefined}
        contentStyle={[styles.content, flip && { transform: [{ scaleX: -1 }] }]}
      >
        {loading ? (
          <ActivityIndicator color={tint} />
        ) : (
          <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </Shard>
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    defaultColor: { color: colors.accent },
    content: { minHeight: 50, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 16, fontWeight: '700' },
  })
