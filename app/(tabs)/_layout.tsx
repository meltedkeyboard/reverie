import { Redirect } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { HomeContinueButton } from '@/components/ContinueButton'
import type { ContinueKind } from '@/db/continue'
import { isOnboardingComplete } from '@/db/onboarding'
import { useDatabase } from '@/db/provider'
import { LastChatProvider } from '@/hooks/useLastChat'
import { useTranslation } from '@/i18n'
import { noteTabFocus } from '@/lib/searchScope'
import { useColors } from '@/theme'

type TabListeners = ({ route }: { route: { name: string } }) => { tabPress: () => void; focus: () => void }

// The home tabs that show the continue button, and whose chat it shows.
const HOME_TABS: Record<string, ContinueKind> = { index: 'character', rooms: 'room' }

export default function TabsLayout() {
  const db = useDatabase()
  const colors = useColors()
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
  // Characters and Rooms changes what it shows instead of swapping two buttons.
  return (
    <LastChatProvider>
      <View style={styles.blank}>
        <AppTabs listeners={listeners} />
        <HomeContinueButton kind={home} />
      </View>
    </LastChatProvider>
  )
}

function AppTabs({ listeners }: { listeners: TabListeners }) {
  const colors = useColors()
  const { t } = useTranslation()
  // The screens draw their own insets from the safe area, which already takes in the
  // tab bar; left automatic, scroll views would get them a second time.
  return (
    <NativeTabs tintColor={colors.accent} screenListeners={listeners}>
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>{t('characters.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rooms" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>{t('rooms.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>{t('settings.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
      </NativeTabs.Trigger>
      {/* On iOS 26 the search tab stands apart from the others, as its own glass button. */}
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Label>{t('search.title')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}

const styles = StyleSheet.create({
  blank: { flex: 1 },
})
