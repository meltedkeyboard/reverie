import { Redirect, Stack, Tabs } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'

import { AndroidFloatingTabBar, getAndroidTabBarBottom, getAndroidTabBarSpace } from '@/components/chrome/AndroidTabBar'
import { useHomeWallpaperAccent } from '@/components/chrome/ChatChrome'
import { HomeContinueButton } from '@/components/chat/ContinueButton'
import type { ContinueKind } from '@/db/prefs/continue'
import { isOnboardingComplete } from '@/db/prefs/onboarding'
import { useDatabase } from '@/db/provider'
import { useLayoutMode } from '@/hooks/util/useLayoutMode'
import { LastChatProvider } from '@/hooks/chat/useLastChat'
import { useTranslation } from '@/i18n'
import { noteTabFocus } from '@/lib/core/searchScope'
import { useColors } from '@/theme'
import { isAndroid } from '@/lib/core/platform'

type TabListeners = ({ route }: { route: { name: string } }) => { tabPress: () => void; focus: () => void }

// The home tabs that show the continue button, and whose chat it shows.
const HOME_TABS: Record<string, ContinueKind> = { index: 'character', rooms: 'room' }

export default function TabsLayout() {
  const db = useDatabase()
  const colors = useColors()
  const wallpaperAccent = useHomeWallpaperAccent()
  const accentColor = wallpaperAccent?.accent ?? colors.accent
  const accentSoftColor = wallpaperAccent?.accentSoft ?? colors.accentSoft
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [home, setHome] = useState<ContinueKind | null>('character')
  const wide = useLayoutMode() === 'wide'

  // The native tab bar switches at once, while focus reaches JS only after the navigator
  // has rendered the new state, long enough for the button to show over Settings for a
  // moment. tabPress is sent before that; focus still covers switches made in code.
  const listeners: TabListeners = ({ route }) => ({
    tabPress: () => setHome(HOME_TABS[route.name] ?? null),
    focus: () => {
      noteTabFocus(route.name)
      setHome(HOME_TABS[route.name] ?? null)
    },
  })

  // Wiping all data from Settings leaves for onboarding, which unmounts the tabs, so a
  // check on mount is enough.
  useEffect(() => {
    isOnboardingComplete(db).then(setOnboarded)
  }, [db])

  if (onboarded === null) return <View style={[styles.blank, { backgroundColor: colors.bg }]} />
  if (!onboarded) return <Redirect href="/onboarding" />

  // One continue button over the tabs rather than one per tab, so switching between
  // Characters and Rooms changes what it shows instead of swapping two buttons.
  // A wide window has the sidebar for what the tabs do; the screens then stack in place of
  // the bar, and there is no continue button, the sidebar lists every chat.
  if (wide) {
    return (
      <LastChatProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </LastChatProvider>
    )
  }

  if (isAndroid) {
    return (
      <LastChatProvider>
        <AndroidTabsLayout
          listeners={listeners}
          home={home}
          accentColor={accentColor}
          accentSoftColor={accentSoftColor}
        />
      </LastChatProvider>
    )
  }

  return (
    <LastChatProvider>
      <View style={styles.blank}>
        <AppTabs listeners={listeners} accentColor={accentColor} />
        <HomeContinueButton kind={home} accentColor={accentColor} />
      </View>
    </LastChatProvider>
  )
}

function AndroidTabsLayout({
  listeners,
  home,
  accentColor,
  accentSoftColor,
}: {
  listeners: TabListeners
  home: ContinueKind | null
  accentColor?: string
  accentSoftColor?: string
}) {
  const insets = useSafeAreaInsets()
  const colors = useColors()

  // On Android the custom floating capsule tab bar floats over the content.
  // We inset the safe area bottom so that screens and lists reserve room above the tab bar.
  const tabBarBottom = getAndroidTabBarBottom(insets.bottom)
  const tabInsets = useMemo(
    () => ({
      ...insets,
      bottom: getAndroidTabBarSpace(insets.bottom),
    }),
    [insets]
  )

  return (
    <SafeAreaInsetsContext.Provider value={tabInsets}>
      <View style={styles.blank}>
        <Tabs
          tabBar={(props) => (
            <AndroidFloatingTabBar
              {...props}
              bottom={tabBarBottom}
              sideInsets={insets}
              accentColor={accentColor}
              accentSoftColor={accentSoftColor}
            />
          )}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.bg },
          }}
          screenListeners={listeners}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="rooms" />
          <Tabs.Screen name="settings" />
          <Tabs.Screen name="search" />
        </Tabs>
        <HomeContinueButton kind={home} accentColor={accentColor} />
      </View>
    </SafeAreaInsetsContext.Provider>
  )
}

function AppTabs({ listeners, accentColor }: { listeners: TabListeners; accentColor?: string }) {
  const colors = useColors()
  const { t } = useTranslation()

  return (
    <NativeTabs tintColor={accentColor ?? colors.accent} screenListeners={listeners}>
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>{t('characters.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rooms" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>{t('rooms.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="forum" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>{t('settings.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
      {/* In iOS 27 search is a unified inline tab item inside the tab bar alongside other tabs, without a separate floating island */}
      <NativeTabs.Trigger name="search" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>{t('search.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'magnifyingglass', selected: 'magnifyingglass' }} md="search" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}

const styles = StyleSheet.create({
  blank: { flex: 1 },
})
