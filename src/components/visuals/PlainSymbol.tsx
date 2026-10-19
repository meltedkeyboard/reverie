import { Icon } from '@/components/visuals/Icon'
import { SymbolView } from 'expo-symbols'
import type { ComponentProps } from 'react'
import { View, type ColorValue } from 'react-native'

import { swiftUI } from '@/lib/ui/nativeUI'

type Props = {
  // The SF Symbol, and the glyph drawn where there are no SF Symbols.
  name: ComponentProps<typeof SymbolView>['name']
  fallback: ComponentProps<typeof Icon>['name']
  // The symbol's point size, and the box it sits centered in.
  size: number
  box: number
  color: ColorValue
}

// An SF Symbol drawn by a plain UIImageView: no SwiftUI host behind it, so a list can lay
// out many at once. It stands in for `Icon` and `SFIcon` (each a SwiftUI host) in a message
// row until the row takes those on, and looks the same.
export function PlainSymbol({ name, fallback, size, box, color }: Props) {
  if (!swiftUI) return <Icon name={fallback} size={size} color={color as string} />
  return (
    <View pointerEvents="none" style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={name} size={size} tintColor={color} />
    </View>
  )
}
