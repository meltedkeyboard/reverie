import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'

import { StartupBoundary } from '@/components/StartupBoundary'
import { migrate } from '@/db/schema'
import { loadLocalePreference, loadThemePreference, saveLocalePreference, saveThemePreference } from '@/db/settings'
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

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref)
    saveThemePreference(db, pref)
  }

  const setLocalePreference = (pref: LocalePreference) => {
    setLocalePreferenceState(pref)
    saveLocalePreference(db, pref)
  }

  return (
    <LocaleContextProvider preference={localePreference} setPreference={setLocalePreference}>
      <ThemeContextProvider preference={preference} setPreference={setPreference}>
        <AppShell />
      </ThemeContextProvider>
    </LocaleContextProvider>
  )
}

function AppShell() {
  const { colors, scheme } = useTheme()
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
        <View style={[styles.shell, { borderColor: colors.border }]}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        </View>
      </ThemeProvider>
      <DialogHost />
    </>
  )
}

// Stretched across a desktop monitor the chat falls apart, so on the web the app
// keeps to a phone-width column in the middle of the page.
const shell: ViewStyle =
  Platform.OS === 'web'
    ? { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth }
    : { flex: 1 }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  shell,
})
