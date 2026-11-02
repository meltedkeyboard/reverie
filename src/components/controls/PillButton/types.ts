import type { ComponentProps } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import type { SFIcon } from '../../visuals/SFIcon'

export type PillButtonProps = {
  // Without a label the button is a circle around the icon; accessibilityLabel names it then.
  label?: string
  accessibilityLabel?: string
  // A symbol before the label, in the label's color. With `slide`, the button shows no
  // spinner while loading: the symbol keeps leaving that way and coming back from the other.
  // `plain` draws the Ionicons glyph instead of the SF Symbol, for a button inside a
  // NativeMenu: a SwiftUI symbol in the menu's label gets the accent tint. The glyph then
  // takes the label's color, where the SF Symbol is in the text color.
  icon?: Pick<ComponentProps<typeof SFIcon>, 'name' | 'fallback'> & { slide?: 'up' | 'down'; plain?: boolean }
  onPress?: () => void
  // The label's color, which says what the action is: the accent, or danger for deleting.
  color?: string
  // Tints the glass with the color and turns the label white, for actions that should
  // stand out on the page: backups, deleting.
  filled?: boolean
  // Leaves the glass out on iOS 26 too: the fill or the plain surface, as elsewhere.
  flat?: boolean
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}
