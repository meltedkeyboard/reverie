import { Stack, ThemeProvider, useTheme as useNavigationTheme } from 'expo-router'
import { useMemo } from 'react'

import { useStore } from '@/components/chat/thread/store'
import { useSheetTones } from '@/components/overlays/BottomSheet'
import { backgroundLook } from '@/lib/images/backgroundLook'
import { SchemeOverride, useColors, useTheme } from '@/theme'

// The controls of /background as the system sheet (iOS), with the system's bar as the
// attach menu has: a stack of one screen. The sheet itself is set in the root layout. It is
// in the scheme the chat will get over the picture, as the screen under it.
export default function BackgroundLookLayout() {
  const look = useStore(backgroundLook)
  return (
    <SchemeOverride scheme={look?.scheme ?? null}>
      <LookStack />
    </SchemeOverride>
  )
}

function LookStack() {
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  // The system's buttons on the bar (close, reset) take their light or dark look from the
  // navigation theme, not from ours, so it is given the chat's scheme as well.
  const outer = useNavigationTheme()
  const navigationTheme = useMemo(() => ({ ...outer, dark: scheme === 'dark' }), [outer, scheme])
  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: tones.sheet },
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: tones.sheet },
        }}
      />
    </ThemeProvider>
  )
}
