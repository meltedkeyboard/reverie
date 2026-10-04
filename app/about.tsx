import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { Daydream, DreamyBlock, DreamyText } from '@/components/Daydream'
import { FormScreenHeader } from '@/components/FormScreenHeader'
import { useScreenPadding } from '@/components/GlassHeader'
import { Divider } from '@/components/motifs/Divider'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import { Wordmark } from '@/components/Wordmark'
import { setOnboardingComplete } from '@/db/onboarding'
import { useDatabase } from '@/db/provider'
import { useShake } from '@/hooks/useShake'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import { APP_VERSION } from '@/lib/version'
import { type Colors, textStyles, useColors, useStyles } from '@/theme'

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
      {/* Left alone for a while, the page drifts off: see Daydream. */}
      <Daydream style={styles.screen}>
        <ScrollView contentContainerStyle={padding}>
          <DreamyBlock seed={1} style={styles.wordmark}>
            <Wordmark width={220} optical />
          </DreamyBlock>
          <DreamyText seed={2} style={styles.version}>
            {t('about.version', { version: APP_VERSION })}
          </DreamyText>

          <DreamyText seed={3} style={styles.tagline}>
            {t('about.tagline')}
          </DreamyText>

          <DreamyBlock seed={21}>
            <Divider />
          </DreamyBlock>

          <DreamyBlock seed={4}>
            <Eyebrow label={t('about.dataTitle')} color={colors.text} />
          </DreamyBlock>
          <DreamyText seed={5} style={styles.note}>
            {t('about.dataText')}
          </DreamyText>

          <DreamyBlock seed={22}>
            <Divider />
          </DreamyBlock>

          <DreamyBlock seed={6}>
            <Eyebrow label={t('about.serverTitle')} color={colors.text} />
          </DreamyBlock>
          <DreamyText seed={7} style={styles.note}>
            {t('about.serverText')}
          </DreamyText>

          <DreamyBlock seed={23}>
            <Divider />
          </DreamyBlock>

          <DreamyBlock seed={8}>
            <Eyebrow label={t('about.backupsTitle')} color={colors.text} />
          </DreamyBlock>
          <DreamyText seed={9} style={styles.note}>
            {t('about.backupsText')}
          </DreamyText>

          <DreamyText seed={10} style={styles.shakeHint}>
            {t('about.shakeHint')}
          </DreamyText>
        </ScrollView>
      </Daydream>

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
  note: { ...textStyles(colors).note, marginBottom: 14 },
  shakeHint: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 24 },
})
