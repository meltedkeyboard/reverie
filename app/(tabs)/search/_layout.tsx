import { Stack } from 'expo-router'

import { useColors } from '@/theme'

// A stack of its own, for the native header whose search field iOS 26 moves down into
// the tab bar.
export default function SearchLayout() {
  const colors = useColors()
  return <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }} />
}
