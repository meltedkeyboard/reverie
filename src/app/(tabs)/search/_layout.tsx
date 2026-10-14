import { Stack } from 'expo-router'

import { useColors } from '@/theme'

// A stack of its own, for the search screen embedded inline into the tab bar in iOS 27 style.
export default function SearchLayout() {
  const colors = useColors()
  return <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }} />
}
