import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, type Theme } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'

import { AppLock } from '@/components/AppLock'
import { Sidebar } from '@/components/Sidebar'
import { StartupBoundary } from '@/components/StartupBoundary'
import { migrate } from '@/db/schema'
import { loadLocalePreference, loadThemePreference, saveLocalePreference, saveThemePreference } from '@/db/settings'
import { useIsWideWeb } from '@/hooks/useResponsive'
import { LocaleContextProvider, type LocalePreference } from '@/i18n'
import { DialogHost } from '@/lib/dialogs'
import { colors as darkColors, ThemeContextProvider, useTheme, type ThemePreference } from '@/theme'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StartupBoundary>
        <KeyboardProvider>
          <Suspense fallback={<View style={styles.root} />}>
            <SQLiteProvider databaseName="reverie.db" onInit={migrate}>
              <ThemedApp />
            </SQLiteProvider>
          </Suspense>
        </KeyboardProvider>
      </StartupBoundary>
    </GestureHandlerRootView>
  )
}

function ThemedApp() {
  const db = useSQLiteContext()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [localePreference, setLocalePreferenceState] = useState<LocalePreference>('system')

  useEffect(() => {
    loadThemePreference(db).then(setPreferenceState)
    loadLocalePreference(db).then(setLocalePreferenceState)
  }, [db])

  // Stable, so the context values (and every header built from `t`) don't change per render.
  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref)
      saveThemePreference(db, pref)
    },
    [db]
  )

  const setLocalePreference = useCallback(
    (pref: LocalePreference) => {
      setLocalePreferenceState(pref)
      saveLocalePreference(db, pref)
    },
    [db]
  )

  return (
    <LocaleContextProvider preference={localePreference} setPreference={setLocalePreference}>
      <ThemeContextProvider preference={preference} setPreference={setPreference}>
        <AppLock>
          <AppShell />
        </AppLock>
      </ThemeContextProvider>
    </LocaleContextProvider>
  )
}

function AppShell() {
  const { colors, scheme } = useTheme()
  const pathname = usePathname()
  // Onboarding is a full-bleed introduction, not a screen alongside the character rail.
  const showSidebar = useIsWideWeb() && pathname !== '/onboarding'
  useWebScrollbarStyle(colors, scheme)
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

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="viewer" options={{ animation: 'fade' }} />
    </Stack>
  )

  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <ThemeProvider value={navigationTheme}>
        <View style={[styles.backdrop, Platform.OS === 'web' && { backgroundColor: scheme === 'light' ? '#E7E7EE' : '#000000' }]}>
          <View style={[showSidebar ? styles.shellWide : styles.shell, { borderColor: colors.border, backgroundColor: colors.bg }]}>
            {showSidebar ? (
              <View style={styles.scaleClip}>
                <View style={styles.scaleInner}>
                  <View style={styles.desktopRow}>
                    <Sidebar />
                    <View style={styles.desktopMain}>{stack}</View>
                  </View>
                </View>
              </View>
            ) : (
              stack
            )}
          </View>
        </View>
      </ThemeProvider>
      <DialogHost />
    </>
  )
}

// Injects (and keeps updated) a themed scrollbar for every scroll container on web —
// react-native-web leaves the browser's stock scrollbar untouched otherwise, which
// looks out of place next to the rest of the UI.
function useWebScrollbarStyle(colors: ReturnType<typeof useTheme>['colors'], scheme: 'light' | 'dark') {
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const thumb = scheme === 'light' ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.22)'
    const thumbHover = scheme === 'light' ? 'rgba(0, 0, 0, 0.32)' : 'rgba(255, 255, 255, 0.32)'
    let tag = document.getElementById('web-scrollbar-style') as HTMLStyleElement | null
    if (!tag) {
      tag = document.createElement('style')
      tag.id = 'web-scrollbar-style'
      document.head.appendChild(tag)
    }
    tag.textContent = `
      * { scrollbar-width: thin; scrollbar-color: ${thumb} transparent; }
      *::-webkit-scrollbar { width: 10px; height: 10px; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-thumb { background-color: ${thumb}; border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
      *::-webkit-scrollbar-thumb:hover { background-color: ${thumbHover}; background-clip: padding-box; }
      *::-webkit-scrollbar-corner { background: transparent; }
    `
  }, [colors, scheme])
}

// Stretched across a desktop monitor the chat falls apart, so on narrow web the app
// keeps to a phone-width column in the middle of the page; wide web instead gets a
// full-bleed two-pane layout (character rail + routed screen) filling the monitor.
const shell: ViewStyle =
  Platform.OS === 'web'
    ? { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth }
    : { flex: 1 }

// The phone-optimized text and controls read as tiny once the shell is simply widened
// on a 2K/4K monitor, so the two-pane content is scaled up as a block instead — laid
// out at 1/DESKTOP_SCALE of the box and then CSS-scaled back to fill it, which enlarges
// every screen without touching each one's own sizes.
const DESKTOP_SCALE = 1.35
const scaleInner = {
  width: `${100 / DESKTOP_SCALE}%`,
  height: `${100 / DESKTOP_SCALE}%`,
  transform: [{ scale: DESKTOP_SCALE }],
  transformOrigin: 'top left',
} as unknown as ViewStyle

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  backdrop: { flex: 1 },
  shell,
  // Full-bleed on wide web: independent of the phone-width `shell` (rather than
  // overriding its maxWidth: 640, since react-native-web's style flattening ignores an
  // `undefined` override and would keep the cap), filling the monitor edge to edge.
  shellWide: { flex: 1, width: '100%' },
  scaleClip: { flex: 1, overflow: 'hidden' },
  scaleInner,
  desktopRow: { flex: 1, flexDirection: 'row' },
  desktopMain: { flex: 1, position: 'relative' },
})
