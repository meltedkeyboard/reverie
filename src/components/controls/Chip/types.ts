import type { ComponentProps } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import type { SFIcon } from '../../visuals/SFIcon'

export type ChipProps = {
  label: string
  active: boolean
  onPress: () => void
  style?: StyleProp<ViewStyle>
  // Shows the symbol instead of the label, which is then only read out.
  icon?: { symbol: ComponentProps<typeof SFIcon>['name']; fallback: ComponentProps<typeof SFIcon>['fallback'] }
  // The ink while not chosen, as colors.danger for removing.
  ink?: string
  // Liquid Glass on iOS 26. Off by default: a chip is the plain surface, filled when chosen.
  glass?: boolean
  // Interactive glass springs under the finger. Off by default: in a row that scrolls
  // sideways the spring pulls the chip along with the scroll.
  interactive?: boolean
  // The label beside the symbol rather than only read out.
  labeled?: boolean
  // Busy: the symbol runs away `slide` and back, at least one lap, or a spinner takes its
  // place. Neither busy nor disabled fades the chip (glass under opacity is not drawn), its
  // ink goes faint instead.
  loading?: boolean
  slide?: 'up' | 'down'
  disabled?: boolean
}
