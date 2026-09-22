import { useState, type ComponentProps, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'

import { showSheet } from '@/lib/dialogs'
import { swiftUI } from '@/lib/nativeUI'
import { useTheme } from '@/theme'

export type MenuItem = {
  label: string
  // SF Symbol shown next to the label in the native menu.
  systemImage: string
  destructive?: boolean
  onSelect: () => void
}

type Props = {
  items: MenuItem[]
  children: ReactNode
  style?: StyleProp<ViewStyle>
  disabled?: boolean
}

type SymbolName = NonNullable<ComponentProps<NonNullable<typeof swiftUI>['ui']['Image']>['systemName']>

// The trigger is drawn by React Native, so it matches the rest of the screen exactly.
// On iOS an invisible SwiftUI menu covers it and takes the tap, which makes the system
// menu grow out of the trigger. Elsewhere the tap opens the action sheet.
export function NativeMenu({ items, children, style, disabled = false }: Props) {
  const { scheme } = useTheme()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  if (!swiftUI) {
    return (
      <Pressable
        onPress={() => showSheet(undefined, items)}
        disabled={disabled}
        hitSlop={4}
        style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}
      >
        {children}
      </Pressable>
    )
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }))
  }

  const { Host, Menu, Button, Text } = swiftUI.ui
  const m = swiftUI.modifiers
  return (
    <View style={style} onLayout={onLayout}>
      {children}
      {size ? (
        // A transform moves the composer above the keyboard, but SwiftUI keeps seeing
        // the untransformed frame under the keyboard and would shift its content up.
        <Host style={StyleSheet.absoluteFill} ignoreSafeArea="all" colorScheme={scheme}>
          <Menu
            modifiers={[m.disabled(disabled)]}
            // An empty text only gives the label its size and draws nothing, so there is
            // nothing for the menu to tint; contentShape makes the whole area tappable.
            label={<Text modifiers={[m.frame(size), m.contentShape(m.shapes.rectangle())]}> </Text>}
          >
            {items.map((item) => (
              <Button
                key={item.label}
                label={item.label}
                systemImage={item.systemImage as SymbolName}
                role={item.destructive ? 'destructive' : undefined}
                onPress={item.onSelect}
              />
            ))}
          </Menu>
        </Host>
      ) : null}
    </View>
  )
}
