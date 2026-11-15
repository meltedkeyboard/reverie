import { Fragment, useState, type ComponentProps, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'

import { showSheet } from '@/lib/ui/dialogs'
import { liquidGlass, swiftUI } from '@/lib/ui/nativeUI'
import { PRESS_ANYWHERE } from '@/lib/ui/press'
import { useTheme } from '@/theme'

export type MenuItem = {
  label: string
  // SF Symbol shown next to the label in the native menu.
  systemImage?: string
  destructive?: boolean
  // A line above it in the native menu, setting it apart from the items before; the action
  // sheet has none.
  separated?: boolean
  onSelect?: () => void
  // A submenu that unfolds from this item.
  children?: MenuItem[]
}

type Props = {
  title?: string
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
// Always false: hosting React Native children in SwiftUI (RNHostView) causes layout coordinate
// jumps during iOS card-stack / formSheet transitions. Using GlassSurface directly in React Native
// keeps the trigger rock-solid across all animations.
export const nativeMenuGlass = false

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
      <View pointerEvents="none" style={styles.triggerContent}>
        {children}
      </View>
    </Pressable>
  )
}

type SymbolName = NonNullable<ComponentProps<NonNullable<typeof swiftUI>['ui']['Image']>['systemName']>

// The items as the views of a SwiftUI menu: buttons, submenus and the lines between them.
// For a menu of SwiftUI's own, as NativeMenu's or the context menu of a row of a list.
export function menuItemViews(items: MenuItem[]): ReactNode[] {
  const { Menu, Button, Divider } = swiftUI!.ui
  // Keyed by place, not by label: two items may read the same (rooms with one name).
  const toView = (item: MenuItem, i: number): ReactNode =>
    item.separated ? (
      <Fragment key={i}>
        <Divider />
        {toView({ ...item, separated: false }, i)}
      </Fragment>
    ) : item.children ? (
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
  return items.map(toView)
}

// The trigger is drawn by React Native, so it matches the rest of the screen exactly.
// On iOS it is hosted inside the label of a SwiftUI menu, which makes the system menu
// grow out of the trigger itself. Elsewhere the tap opens the action sheet.
export function NativeMenu({ title, items, children, style, disabled = false, glassRadius }: Props) {
  const { scheme } = useTheme()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  if (!swiftUI) {
    return (
      <TapTrigger onPress={() => showSheet(title, items)} disabled={disabled} style={style}>
        {children}
      </TapTrigger>
    )
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }))
  }

  const { Host, Menu, Section, Text } = swiftUI.ui
  const m = swiftUI.modifiers
  const buttons = menuItemViews(items)
  const content = title ? <Section title={title}>{buttons}</Section> : buttons
  const shape = m.shapes.rectangle()

  // The trigger is drawn by React Native, so it matches the rest of the screen exactly
  // and stays rock-solid during modal sheet presentations. An invisible SwiftUI Menu
  // covers it and takes the tap, which makes the system menu grow out of the trigger.
  return (
    <View style={style} onLayout={onLayout}>
      {children}
      {size ? (
        <Host style={StyleSheet.absoluteFill} alignment="center" ignoreSafeArea="all" colorScheme={scheme}>
          <Menu
            modifiers={[m.disabled(disabled)]}
            label={<Text modifiers={[m.frame(size), m.contentShape(shape)]}> </Text>}
          >
            {content}
          </Menu>
        </Host>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  triggerContent: { alignSelf: 'stretch', flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
})
