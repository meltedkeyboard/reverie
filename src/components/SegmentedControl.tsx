import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { swiftUI } from '@/lib/nativeUI'
import { useTheme } from '@/theme'

type Option<T extends string> = { value: T; label: string }

type Props<T extends string> = {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}

// A native UISegmentedControl (via SwiftUI's Picker) where available, so switching
// plays the system's own sliding-knob animation instead of an instant color swap.
// Elsewhere (Android, web) it falls back to a plain pressable row.
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  if (swiftUI) {
    const { Host, Picker, Text: UIText } = swiftUI.ui
    const { tag, pickerStyle } = swiftUI.modifiers
    return (
      <Host matchContents={{ vertical: true }} style={styles.host}>
        <Picker selection={value} onSelectionChange={(v) => onChange(v as T)} modifiers={[pickerStyle('segmented')]}>
          {options.map((opt) => (
            <UIText key={opt.value} modifiers={[tag(opt.value)]}>
              {opt.label}
            </UIText>
          ))}
        </Picker>
      </Host>
    )
  }

  return (
    <View style={styles.segment}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[styles.segmentItem, value === opt.value && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, value === opt.value && styles.segmentTextActive]}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    host: { height: 36 },
    segment: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 10, padding: 3 },
    segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    segmentItemActive: { backgroundColor: colors.accentSoft },
    segmentText: { color: colors.textMuted, fontSize: 13 },
    segmentTextActive: { color: colors.accent, fontWeight: '600' },
  })
