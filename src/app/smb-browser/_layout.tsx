import { Stack, ThemeProvider, useTheme as useNavigationTheme } from 'expo-router'
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { useColors, useTheme } from '@/theme'

export const unstable_settings = {
  initialRouteName: 'index',
}

// The SMB folder picker layout as an inner stack inside the iOS system sheet.
// Pushes each directory level as a distinct screen with native transitions.
export default function SmbBrowserLayout() {
  const colors = useColors()
  const { scheme } = useTheme()
  const outer = useNavigationTheme()
  const navigationTheme = useMemo(() => ({ ...outer, dark: scheme === 'dark' }), [outer, scheme])

  return (
    <View style={styles.root}>
      <ThemeProvider value={navigationTheme}>
        <Stack
          screenOptions={{
            headerShown: true,
            headerTransparent: true,
            headerBlurEffect: 'regular',
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'generic',
            headerTintColor: colors.accent,
            headerTitleStyle: { color: colors.text },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="[...subpath]" />
        </Stack>
      </ThemeProvider>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill },
})
