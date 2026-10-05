import { useState, type ComponentProps, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'

import { showSheet } from '@/lib/dialogs'
import { liquidGlass, swiftUI } from '@/lib/nativeUI'
import { PRESS_ANYWHERE } from '@/lib/press'
import { useTheme } from '@/theme'

export type MenuItem = {
  label: string
  // SF Symbol shown next to the label in the native menu.
  systemImage?: string
  destructive?: boolean
  onSelect?: () => void
  // A submenu that unfolds from this item.
  children?: MenuItem[]
}

type Props = {
  items: MenuItem[]
  children: ReactNode
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  // Corner radius of a Liquid Glass background for the children. When the menu can draw
  // it (see nativeMenuGlass), the glass is the menu's label and the menu morphs out of
  // it; the caller then must not draw its own glass.
  glassRadius?: number
}

// Whether NativeMenu draws the glass behind its children itself when given glassRadius.
export const nativeMenuGlass = swiftUI !== null && liquidGlass

// A trigger that simply runs `onPress`, dimming while it is held: what a menu is where there
// is no native menu to open.
export function TapTrigger({ onPress, disabled, style, children }: { onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      pressRetentionOffset={PRESS_ANYWHERE}
      style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}
    >
      {children}
    </Pressable>
  )
}

type SymbolName = NonNullable<ComponentProps<NonNullable<typeof swiftUI>['ui']['Image']>['systemName']>

// The trigger is drawn by React Native, so it matches the rest of the screen exactly.
// On iOS it is hosted inside the label of a SwiftUI menu, which makes the system menu
// grow out of the trigger itself. Elsewhere the tap opens the action sheet.
export function NativeMenu({ items, children, style, disabled = false, glassRadius }: Props) {
  const { scheme } = useTheme()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  if (!swiftUI) {
    return (
      <TapTrigger onPress={() => showSheet(undefined, items)} disabled={disabled} style={style}>
        {children}
      </TapTrigger>
    )
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }))
  }

  const { Host, Menu, Button } = swiftUI.ui
  const m = swiftUI.modifiers
  // Keyed by place, not by label: two items may read the same (rooms with one name).
  const toView = (item: MenuItem, i: number): ReactNode =>
    item.children ? (
      <Menu key={i} label={item.label} systemImage={item.systemImage}>
        {item.children.map(toView)}
      </Menu>
    ) : (
      <Button
        key={i}
        label={item.label}
        systemImage={item.systemImage as SymbolName | undefined}
        role={item.destructive ? 'destructive' : undefined}
        onPress={item.onSelect}
      />
    )
  const buttons = items.map(toView)

  const { Group, RNHostView } = swiftUI.ui
  const glass = glassRadius !== undefined && liquidGlass
  const shape = glass ? m.shapes.roundedRectangle({ cornerRadius: glassRadius }) : m.shapes.rectangle()
  // The children go inside the menu's label, so the menu grows out of them and they morph
  // into it together with the glass. A hidden copy stays in the React Native layout and
  // gives the label its size, so the trigger keeps its flex sizing and text truncation.
  return (
    <View style={style} onLayout={onLayout}>
      <View style={styles.hidden} pointerEvents="none">
        {children}
      </View>
      {size ? (
        // A transform moves the composer above the keyboard, but SwiftUI keeps seeing
        // the untransformed frame under the keyboard and would shift its content up.
        <Host style={StyleSheet.absoluteFill} ignoreSafeArea="all" colorScheme={scheme}>
          <Menu
            modifiers={[m.disabled(disabled)]}
            label={
              <Group
                modifiers={[
                  m.frame(size),
                  m.contentShape(shape),
                  ...(glass
                    ? [m.glassEffect({ glass: { variant: 'regular' }, shape: 'roundedRectangle', cornerRadius: glassRadius })]
                    : []),
                ]}
              >
                <RNHostView>
                  <View style={styles.hosted} pointerEvents="none">
                    {children}
                  </View>
                </RNHostView>
              </Group>
            }
          >
            {buttons}
          </Menu>
        </Host>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  hosted: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
