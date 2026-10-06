import { Icon } from '@/components/visuals/Icon'
import Animated, { type CSSTransitionProperties } from 'react-native-reanimated'

import { useColors } from '@/theme'

const POP: CSSTransitionProperties = {
  transitionProperty: ['opacity', 'transform'],
  transitionDuration: 200,
  transitionTimingFunction: 'ease-out',
}

// The checkmark at the end of a row picked in a sheet; it pops in and out rather than
// blinking, and keeps its place in the row while hidden.
export function Check({ on }: { on: boolean }) {
  const colors = useColors()
  return (
    <Animated.View style={[{ opacity: on ? 1 : 0, transform: [{ scale: on ? 1 : 0.5 }] }, POP]}>
      <Icon name="checkmark" size={24} color={colors.accent} />
    </Animated.View>
  )
}
