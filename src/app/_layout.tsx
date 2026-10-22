import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Suspense, useEffect, useMemo } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'

import { AppLock } from '@/components/startup/AppLock'
import { useSheetTones } from '@/components/overlays/BottomSheet'
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
import { loadLocalePreference, loadThemeMode, loadThemeName, saveLocalePreference, saveThemeMode, saveThemeName } from '@/db/prefs/settings'
import { CloudSyncProvider } from '@/hooks/features/useCloudSync'
import { useLayoutMode } from '@/hooks/util/useLayoutMode'
import { useScreenPathname } from '@/hooks/util/useScreenPathname'
import { useStoredValue } from '@/hooks/util/useStoredFlag'
import { attachDetent, finishAttachSession } from '@/lib/chat/attachSession'
import { ChatTextProvider } from '@/lib/chat/chatText'
import { isElectron, isWeb } from '@/lib/core/platform'
import { LocaleContextProvider, type LocalePreference } from '@/i18n'
import { colors as darkColors, ThemeContextProvider, useTheme, type ThemeMode, type ThemeName } from '@/theme'

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
  const [theme, setTheme] = useStoredValue<ThemeName>(loadThemeName, saveThemeName, 'default')
  const [themeMode, setThemeMode] = useStoredValue<ThemeMode>(loadThemeMode, saveThemeMode, 'system')
  const [localePreference, setLocalePreference] = useStoredValue<LocalePreference>(loadLocalePreference, saveLocalePreference, 'system')

  useEffect(() => {
    isHapticsEnabled(db)
    isConfirmDeleteEnabled(db)
    loadFileLimits(db)
  }, [db])

  return (
    <LocaleContextProvider preference={localePreference} setPreference={setLocalePreference}>
      <ThemeContextProvider theme={theme} setTheme={setTheme} mode={themeMode} setMode={setThemeMode}>
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

// Full-screen routes that go over the sidebar rather than beside it. The viewer goes over it
// see-through instead, the screen under it keeping its sidebar.
const WITHOUT_SIDEBAR = ['/onboarding', '/background', '/avatar-crop']

function AppShell() {
  const { colors, scheme } = useTheme()
  const sheetTones = useSheetTones({ noGlass: true })
  const wide = useLayoutMode() === 'wide'
  const pathname = useScreenPathname()
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
              {/* Over the screen it opens from, which shows through as a picture is pulled away.
                  The picture grows out of its thumbnail and goes back by itself, so the route
                  has no animation of its own, nor the swipe back. */}
              <Stack.Screen
                name="viewer"
                options={{
                  presentation: 'transparentModal',
                  animation: 'none',
                  gestureEnabled: false,
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen name="background" options={{ animation: 'fade' }} />
              <Stack.Screen name="avatar-crop" options={{ animation: 'fade' }} />
              {/* The system sheet with a grabber, pulled down to close; its bar is set by the screen. */}
              <Stack.Screen
                name="generate"
                options={{
                  presentation: 'formSheet',
                  // Until the sheet sets its own title, rather than the name of the route.
                  title: '',
                  sheetAllowedDetents: [1],
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: false,
                  headerShown: true,
                  headerShadowVisible: false,
                  headerBackVisible: false,
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.accent,
                  headerTitleStyle: { color: colors.text },
                }}
              />
              {/* The composer's attach menu, the system sheet of iOS: half the screen, pulled up
                  to the full height, down to close, with a stack of its own inside. */}
              <Stack.Screen
                name="attach"
                options={() => ({
                  presentation: 'formSheet',
                  sheetAllowedDetents: [attachDetent(), 1],
                  sheetGrabberVisible: true,
                  headerShown: false,
                  // Solid, not the glass a partial sheet has on iOS 26.
                  contentStyle: { backgroundColor: sheetTones.sheet },
                })}
                listeners={{
                  transitionEnd: (e) => {
                    if (e.data.closing) finishAttachSession()
                  },
                }}
              />
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
