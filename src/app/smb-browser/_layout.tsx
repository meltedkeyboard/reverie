import { Stack, useTheme as useNavigationTheme } from 'expo-router'
import { useMemo } from 'react'

import { useSheetTones } from '@/components/overlays/BottomSheet'
import { useColors, useTheme } from '@/theme'

export const unstable_settings = {
  initialRouteName: 'index',
}

// The SMB folder picker layout as an inner stack inside the iOS system sheet.
// Pushes each directory level as a distinct screen with native transitions.
export default function SmbBrowserLayout() {
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  const outer = useNavigationTheme()
  const navigationTheme = useMemo(() => ({ ...outer, dark: scheme === 'dark' }), [outer, scheme])

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'generic',
        headerStyle: { backgroundColor: tones.sheet },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: tones.sheet },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[...subpath]" />
    </Stack>
  )
}
