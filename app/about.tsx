import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { FormScreenHeader } from '@/components/FormScreenHeader'
import { useScreenPadding } from '@/components/GlassHeader'
import { Divider } from '@/components/motifs/Divider'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import { Star } from '@/components/motifs/Star'
import { Wordmark } from '@/components/Wordmark'
import { setOnboardingComplete } from '@/db/onboarding'
import { useDatabase } from '@/db/provider'
import { useShake } from '@/hooks/useShake'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import { APP_VERSION } from '@/lib/version'
import { useColors, useStyles, type Colors } from '@/theme'

export default function AboutScreen() {
  const router = useRouter()
  const db = useDatabase()
  const padding = useScreenPadding('form')
  const colors = useColors()
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
        <Text style={styles.version}>{t('about.version', { version: APP_VERSION })}</Text>

        <Text style={styles.tagline}>{t('about.tagline')}</Text>

        <Divider />

        <Eyebrow label={t('about.dataTitle')} color={colors.accent} />
        <Text style={styles.note}>{t('about.dataText')}</Text>

        <Divider />

        <Eyebrow label={t('about.serverTitle')} color={colors.accent} />
        <Text style={styles.note}>{t('about.serverText')}</Text>

        <Divider />

        <Eyebrow label={t('about.backupsTitle')} color={colors.accent} />
        <Text style={styles.note}>{t('about.backupsText')}</Text>

        <Text style={styles.shakeHint}>{t('about.shakeHint')}</Text>

        <View style={styles.footer}>
          <Star size={14} color={colors.textFaint} filled={false} rotation={12} strokeWidth={70} />
        </View>
      </ScrollView>

      <FormScreenHeader title={t('settings.aboutTitle')} />
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
    marginBottom: 8,
    marginHorizontal: 8,
  },
  note: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  footer: { alignItems: 'center', marginTop: 24 },
  shakeHint: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 24 },
})
