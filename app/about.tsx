import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { BackButton, GlassHeader, HeaderTitle, useScreenPadding } from '@/components/GlassHeader'
import { Group } from '@/components/Group'
import { Wordmark } from '@/components/Wordmark'
import { setOnboardingComplete } from '@/db/onboarding'
import { useShake } from '@/hooks/useShake'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import { useStyles, type Colors } from '@/theme'

const version = Constants.expoConfig?.version ?? '1.0.0'

export default function AboutScreen() {
  const router = useRouter()
  const db = useSQLiteContext()
  const padding = useScreenPadding('form')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()

  const restartOnboarding = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    await setOnboardingComplete(db, false)
    router.replace('/onboarding')
  }, [db, router])

  useShake(restartOnboarding, true)

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={padding}>
        <Wordmark width={220} optical style={styles.wordmark} />
        <Text style={styles.version}>{t('about.version', { version })}</Text>

        <Text style={styles.tagline}>{t('about.tagline')}</Text>

        <Group>
          <Row title={t('about.dataTitle')} text={t('about.dataText')} />
          <Row title={t('about.serverTitle')} text={t('about.serverText')} />
          <Row title={t('about.backupsTitle')} text={t('about.backupsText')} />
        </Group>

        <Text style={styles.shakeHint}>{t('about.shakeHint')}</Text>
      </ScrollView>

      <GlassHeader left={<BackButton />}>
        <HeaderTitle>{t('settings.aboutTitle')}</HeaderTitle>
      </GlassHeader>
    </View>
  )
}

function Row({ title, text }: { title: string; text: string }) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowText}>{text}</Text>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  wordmark: { alignSelf: 'center', marginTop: 8 },
  version: { color: colors.textFaint, fontSize: 13, textAlign: 'center', marginTop: 12, marginBottom: 20 },
  tagline: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
    marginHorizontal: 8,
  },
  row: { paddingHorizontal: 16, paddingVertical: 14 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 4 },
  rowText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  shakeHint: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 24 },
})
