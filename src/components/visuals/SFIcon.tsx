import { Icon } from '@/components/visuals/Icon'
import { useEffect, useRef, type ComponentProps } from 'react'
import { View, type ColorValue } from 'react-native'

import { swiftUI } from '@/lib/ui/nativeUI'
import { useTheme } from '@/theme'

type SymbolName = NonNullable<ComponentProps<NonNullable<typeof swiftUI>['ui']['Image']>['systemName']>
type Effect = Parameters<NonNullable<typeof swiftUI>['modifiers']['symbolEffect']>[0]

type Props = {
  // SF Symbol, or the Ionicons glyph without @expo/ui (Expo Go).
  name: SymbolName
  fallback: ComponentProps<typeof Icon>['name']
  size: number
  color: ColorValue
  effect?: Effect
  // A discrete effect plays each time this value changes; the first value plays nothing.
  trigger?: number | string
  // An indefinite effect (breathe, pulse) runs while this is true.
  active?: boolean
  // Swapping `name` plays the system Replace transition instead of a hard cut.
  animateChange?: boolean
  // How long the change takes, as the spring's response in seconds.
  changeResponse?: number
  // Drawn on the accent fill. In the light scheme the symbol comes out dark even with an
  // explicit white color, so the hosted view is given the dark scheme instead.
  onAccent?: boolean
}

// The system symbol animations of iOS 17 and 18 are drawn by SwiftUI itself, so they
// look and time exactly like in Apple's apps. Without @expo/ui the plain icon stays.
export const SFIcon = swiftUI ? NativeIcon : FallbackIcon

function FallbackIcon({ fallback, size, color }: Props) {
  return <Icon name={fallback} size={size} color={color} />
}

function NativeIcon({ name, size, color, effect, trigger, active, animateChange, changeResponse = 0.35, onAccent = false }: Props) {
  const theme = useTheme()
  const scheme = onAccent ? 'dark' : theme.scheme
  const { Host, Image, useNativeState } = swiftUI!.ui
  const { symbolEffect, animation, Animation } = swiftUI!.modifiers
  // A symbol image that changes inside an animated transaction gets the Replace effect
  // from SwiftUI; the animation modifier needs a value that changes along with the name.
  const swaps = useRef({ name, count: 0 })
  if (swaps.current.name !== name) swaps.current = { name, count: swaps.current.count + 1 }
  const fired = useNativeState<number | string>(trigger ?? 0)
  const running = useNativeState(!!active)

  useEffect(() => {
    if (trigger !== undefined) fired.set(trigger)
  }, [fired, trigger])
  useEffect(() => {
    running.set(!!active)
  }, [running, active])

  const modifiers = effect
    ? [symbolEffect(effect, active === undefined ? { value: fired } : { isActive: running })]
    : []
  if (animateChange) modifiers.push(animation(Animation.spring({ response: changeResponse, dampingFraction: 0.7 }), swaps.current.count))
  // The box is a little wider than the glyph: some symbols overhang their nominal size.
  const box = Math.round(size * 1.3)
  return (
    // The parent Pressable must still get the tap, so the hosted view ignores touches.
    <View pointerEvents="none" style={{ width: box, height: box }}>
      {/* Inside the composer a transform lifts the icon above the keyboard, but SwiftUI
          still sees its untransformed frame under the keyboard and would push the
          symbol up out of the safe area. */}
      <Host style={{ width: box, height: box }} ignoreSafeArea="all" colorScheme={scheme}>
        <Image systemName={name} size={size} color={color} modifiers={modifiers} />
      </Host>
    </View>
  )
}
