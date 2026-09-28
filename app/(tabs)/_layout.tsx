import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, Tabs } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useEffect, useState } from 'react'
import { Platform, StyleSheet, View, type ColorValue } from 'react-native'

import { HomeContinueButton } from '@/components/ContinueButton'
import type { ContinueKind } from '@/db/continue'
import { isOnboardingComplete } from '@/db/onboarding'
import { useDatabase } from '@/db/provider'
import { LastChatProvider } from '@/hooks/useLastChat'
import { useIsWideWeb } from '@/hooks/useResponsive'
import { useTranslation } from '@/i18n'
import { noteTabFocus } from '@/lib/searchScope'
import { useColors } from '@/theme'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

type TabListeners = ({ route }: { route: { name: string } }) => { tabPress: () => void; focus: () => void }

// The home tabs that show the continue button, and whose chat it shows.
const HOME_TABS: Record<string, ContinueKind> = { index: 'character', rooms: 'room' }

export default function TabsLayout() {
  const db = useDatabase()
  const colors = useColors()
  const isWideWeb = useIsWideWeb()
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [home, setHome] = useState<ContinueKind | null>('character')

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
  // Characters and Rooms changes what it shows instead of swapping two buttons. Wide web
  // has the sidebar in its place.
  return (
    <LastChatProvider>
      <View style={styles.blank}>
        {Platform.OS === 'web' ? <WebTabs listeners={listeners} /> : <AppTabs listeners={listeners} />}
        {isWideWeb ? null : <HomeContinueButton kind={home} />}
      </View>
    </LastChatProvider>
  )
}

function AppTabs({ listeners }: { listeners: TabListeners }) {
  const colors = useColors()
  const { t } = useTranslation()
  // The screens draw their own insets from the safe area, which on iOS already takes
  // in the tab bar; left automatic, scroll views would get them a second time.
  const ownInsets = Platform.OS === 'ios'
  return (
    <NativeTabs
      tintColor={colors.accent}
      backgroundColor={Platform.OS === 'android' ? colors.surface : undefined}
      indicatorColor={colors.accentSoft}
      screenListeners={listeners}
    >
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets={ownInsets}>
        <NativeTabs.Trigger.Label>{t('characters.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rooms" disableAutomaticContentInsets={ownInsets}>
        <NativeTabs.Trigger.Label>{t('rooms.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }}
          md="forum"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" disableAutomaticContentInsets={ownInsets}>
        <NativeTabs.Trigger.Label>{t('settings.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
      {/* On iOS 26 the search tab stands apart from the others, as its own glass button. */}
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Label>{t('search.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}

// The web build of native tabs is a pill pinned over the top of the page, right where
// the screens have their header, so the web gets a regular bottom bar instead. On wide
// web the sidebar already leads everywhere and the bar is hidden.
function WebTabs({ listeners }: { listeners: TabListeners }) {
  const colors = useColors()
  const { t } = useTranslation()
  const isWideWeb = useIsWideWeb()

  const icon = (name: IoniconName) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Ionicons name={focused ? name : (`${name}-outline` as IoniconName)} size={24} color={color} />
    }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: isWideWeb
          ? { display: 'none' }
          : { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
      screenListeners={listeners}
    >
      <Tabs.Screen name="index" options={{ title: t('characters.title'), tabBarIcon: icon('people') }} />
      <Tabs.Screen name="rooms" options={{ title: t('rooms.title'), tabBarIcon: icon('chatbubbles') }} />
      <Tabs.Screen name="settings" options={{ title: t('settings.title'), tabBarIcon: icon('settings') }} />
      <Tabs.Screen name="search" options={{ title: t('search.title'), tabBarIcon: icon('search') }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  blank: { flex: 1 },
})
