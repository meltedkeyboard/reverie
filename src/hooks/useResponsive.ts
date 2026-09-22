import { Platform, useWindowDimensions } from 'react-native'

// Below this the two-pane desktop layout has no room to breathe and the app
// falls back to the phone-width column it already uses on narrow web and native.
const WIDE_BREAKPOINT = 860

export function useIsWideWeb() {
  const { width } = useWindowDimensions()
  return Platform.OS === 'web' && width >= WIDE_BREAKPOINT
}
