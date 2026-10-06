import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, type Theme } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Suspense, useEffect, useMemo } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'

import { AppLock } from '@/components/startup/AppLock'
import { DialogHost } from '@/components/overlays/DialogHost'
import { Sidebar } from '@/components/chrome/Sidebar'
import { SplashOverlay } from '@/components/startup/SplashOverlay'
import { StartupBoundary } from '@/components/startup/StartupBoundary'
import { TabBar } from '@/components/chrome/TabBar'
import { TitleBar } from '@/components/chrome/TitleBar'
import { ToastHost } from '@/components/overlays/ToastHost'
import { isConfirmDeleteEnabled } from '@/db/prefs/confirmDelete'
import { loadFileLimits } from '@/db/prefs/fileLimits'
import { isHapticsEnabled } from '@/db/prefs/haptics'
import { DatabaseProvider, useDatabase } from '@/db/provider'
import { loadLocalePreference, loadThemePreference, saveLocalePreference, saveThemePreference } from '@/db/prefs/settings'
import { CloudSyncProvider } from '@/hooks/features/useCloudSync'
import { useLayoutMode } from '@/hooks/util/useLayoutMode'
import { useStoredValue } from '@/hooks/util/useStoredFlag'
import { ChatTextProvider } from '@/lib/chat/chatText'
import { isElectron, isWeb } from '@/lib/core/platform'
import { LocaleContextProvider, type LocalePreference } from '@/i18n'
import { colors as darkColors, ThemeContextProvider, useTheme, type ThemePreference } from '@/theme'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StartupBoundary>
        <KeyboardProvider>
          <Suspense fallback={<View style={styles.root} />}>
            <DatabaseProvider>
              <ThemedApp />
            </DatabaseProvider>
          </Suspense>
        </KeyboardProvider>
      </StartupBoundary>
    </GestureHandlerRootView>
  )
}

function ThemedApp() {
  const db = useDatabase()
  const { fontScale } = useWindowDimensions()
  const [preference, setPreference] = useStoredValue<ThemePreference>(loadThemePreference, saveThemePreference, 'system')
  const [localePreference, setLocalePreference] = useStoredValue<LocalePreference>(loadLocalePreference, saveLocalePreference, 'system')

  useEffect(() => {
    isHapticsEnabled(db)
    isConfirmDeleteEnabled(db)
    loadFileLimits(db)
  }, [db])

  return (
    <LocaleContextProvider preference={localePreference} setPreference={setLocalePreference}>
      <ThemeContextProvider preference={preference} setPreference={setPreference}>
        <CloudSyncProvider>
          <ChatTextProvider>
            <AppLock>
              {/* A new text size doesn't always reach the layout of screens already shown, so
                  the screens are built anew for it. The database, the lock and sync stay. */}
              <AppShell key={fontScale} />
            </AppLock>
            <SplashOverlay />
          </ChatTextProvider>
        </CloudSyncProvider>
      </ThemeContextProvider>
    </LocaleContextProvider>
  )
}

// Full-screen routes that go over the sidebar rather than beside it.
const WITHOUT_SIDEBAR = ['/onboarding', '/viewer', '/background', '/avatar-crop']

function AppShell() {
  const { colors, scheme } = useTheme()
  const wide = useLayoutMode() === 'wide'
  const pathname = usePathname()
  const sidebar = wide && !WITHOUT_SIDEBAR.includes(pathname)
  const navigationTheme: Theme = useMemo(
    () => ({
      ...(scheme === 'light' ? DefaultTheme : DarkTheme),
      colors: {
        ...(scheme === 'light' ? DefaultTheme.colors : DarkTheme.colors),
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        primary: colors.accent,
      },
    }),
    [colors, scheme]
  )

  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <ThemeProvider value={navigationTheme}>
        {isElectron ? <TitleBar sidebar={sidebar} pathname={pathname} /> : null}
        <View style={styles.shell}>
          {sidebar ? <Sidebar /> : null}
          <View style={styles.main}>
            {/* Tabs only where there is a pointer to drive them; the desktop app has them in its title bar. */}
            {sidebar && isWeb && !isElectron ? <TabBar pathname={pathname} /> : null}
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              {/* Opens in a blink; closed by the button or a tap, so no swipe-back either. */}
              <Stack.Screen name="viewer" options={{ animation: 'fade', animationDuration: 120, gestureEnabled: false }} />
              <Stack.Screen name="background" options={{ animation: 'fade' }} />
              <Stack.Screen name="avatar-crop" options={{ animation: 'fade' }} />
            </Stack>
          </View>
        </View>
        <DialogHost />
        <ToastHost />
      </ThemeProvider>
    </>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  shell: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
})
