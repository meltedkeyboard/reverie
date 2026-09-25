import { Pressable } from 'react-native'

import * as Haptics from '@/lib/haptics'
import { useColors } from '@/theme'

import { Star } from './Star'

// A star standing in for a Switch: filled and tilted one way when on, outlined and
// tilted the other way when off.
export function StarToggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const colors = useColors()
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync()
        onValueChange(!value)
      }}
      hitSlop={12}
    >
      <Star size={28} color={value ? colors.accent : colors.textFaint} filled={value} rotation={value ? -10 : 8} />
    </Pressable>
  )
}
