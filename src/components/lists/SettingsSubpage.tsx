import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { nativeForm, NativeForm } from '@/components/lists/NativeForm'
import { useTranslation } from '@/i18n'
import { isAndroid } from '@/lib/core/platform'
import { useColors } from '@/theme'

// Shared chrome for Settings sub-screens: renders the SwiftUI Form when available,
// otherwise a scrollable GroupedList under FormScreenHeader or Android GlassHeader.
export function SettingsSubpage({
  title,
  keyboard = false,
  native,
  fallback,
}: {
  title: string
  keyboard?: boolean
  native: (ui: NonNullable<typeof nativeForm>) => ReactNode
  fallback: ReactNode
}) {
  const router = useRouter()
  const colors = useColors()
  const padding = useScreenPadding('form')
  const { t } = useTranslation()

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {nativeForm ? (
        <NativeForm>{native(nativeForm)}</NativeForm>
      ) : keyboard ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
        >
          {fallback}
        </KeyboardAwareScrollView>
      ) : (
        <ScrollView contentContainerStyle={padding}>{fallback}</ScrollView>
      )}
      {isAndroid ? (
        <GlassHeader
          floating
          centerTitle
          left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />}
        >
          <TabTitle star={false}>{title}</TabTitle>
        </GlassHeader>
      ) : (
        <FormScreenHeader title={title} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
})
