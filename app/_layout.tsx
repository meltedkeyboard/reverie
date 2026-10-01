import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'

import { AppLock } from '@/components/AppLock'
import { DialogHost } from '@/components/DialogHost'
import { StartupBoundary } from '@/components/StartupBoundary'
import { isConfirmDeleteEnabled } from '@/db/confirmDelete'
import { isHapticsEnabled } from '@/db/haptics'
import { DatabaseProvider, useDatabase } from '@/db/provider'
import { loadLocalePreference, loadThemePreference, saveLocalePreference, saveThemePreference } from '@/db/settings'
import { CloudSyncProvider } from '@/hooks/useCloudSync'
import { ChatTextProvider } from '@/lib/chatText'
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
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [localePreference, setLocalePreferenceState] = useState<LocalePreference>('system')

  useEffect(() => {
    isHapticsEnabled(db)
    isConfirmDeleteEnabled(db)
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
        <CloudSyncProvider>
          <ChatTextProvider>
          <AppLock>
            {/* A new text size doesn't always reach the layout of screens already shown, so
                the screens are built anew for it. The database, the lock and sync stay. */}
            <AppShell key={fontScale} />
          </AppLock>
          </ChatTextProvider>
        </CloudSyncProvider>
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
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="viewer" options={{ animation: 'fade' }} />
          <Stack.Screen name="background" options={{ animation: 'fade' }} />
          <Stack.Screen name="avatar-crop" options={{ animation: 'fade' }} />
        </Stack>
        <DialogHost />
      </ThemeProvider>
    </>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
})
