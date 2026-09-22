import Constants from 'expo-constants'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { IconButton } from '@/components/IconButton'
import { setOnboardingComplete } from '@/db/onboarding'
import { useShake } from '@/hooks/useShake'
import { useTranslation } from '@/i18n'
import { fonts, useColors } from '@/theme'

const version = Constants.expoConfig?.version ?? '1.0.0'

export default function AboutScreen() {
  const router = useRouter()
  const db = useSQLiteContext()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation()

  const restartOnboarding = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    await setOnboardingComplete(db, false)
    router.replace('/onboarding')
  }, [db, router])

  useShake(restartOnboarding, true)

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: headerHeight + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
      >
        <View style={styles.mark}>
          <Text style={styles.markGlyph}>R</Text>
        </View>
        <Text style={styles.name}>Reverie</Text>
        <Text style={styles.version}>{t('about.version', { version })}</Text>

        <Text style={styles.tagline}>{t('about.tagline')}</Text>

        <View style={styles.card}>
          <Row title={t('about.dataTitle')} text={t('about.dataText')} />
          <Row title={t('about.serverTitle')} text={t('about.serverText')} />
          <Row title={t('about.backupsTitle')} text={t('about.backupsText')} last />
        </View>

        <Text style={styles.shakeHint}>{t('about.shakeHint')}</Text>
      </ScrollView>

      <GlassHeader left={<IconButton name="chevron-back" size={26} onPress={() => router.back()} />}>
        <Text style={styles.title}>{t('settings.aboutTitle')}</Text>
      </GlassHeader>
    </View>
  )
}

function Row({ title, text, last }: { title: string; text: string; last?: boolean }) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowText}>{text}</Text>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, fontWeight: '600' },
  mark: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  markGlyph: { color: colors.accent, fontFamily: fonts.prose, fontSize: 32, fontWeight: '600' },
  name: { color: colors.text, fontFamily: fonts.prose, fontSize: 24, fontWeight: '600', textAlign: 'center' },
  version: { color: colors.textFaint, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 20 },
  tagline: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
    marginHorizontal: 8,
  },
  card: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 4 },
  rowText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  shakeHint: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 24 },
})
