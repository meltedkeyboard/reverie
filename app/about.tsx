import { Stack, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback } from 'react'
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import { EdgeFade } from '@/components/BarChrome'
import { useHeaderHeight, useScreenPadding } from '@/components/GlassHeader'
import { Divider } from '@/components/motifs/Divider'
import { Eyebrow } from '@/components/motifs/Eyebrow'
import { Star } from '@/components/motifs/Star'
import { Wordmark } from '@/components/Wordmark'
import { setOnboardingComplete } from '@/db/onboarding'
import { useShake } from '@/hooks/useShake'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import { fonts, useColors, useStyles, type Colors } from '@/theme'
import pkg from '../package.json'

const { version } = pkg

export default function AboutScreen() {
  const router = useRouter()
  const db = useSQLiteContext()
  const padding = useScreenPadding('form')
  const headerHeight = useHeaderHeight()
  const titleMaxWidth = useWindowDimensions().width - 160
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
        <Text style={styles.version}>{t('about.version', { version })}</Text>

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

      <EdgeFade edge="top" style={{ pointerEvents: 'none', height: headerHeight + 28, position: 'absolute', top: 0, left: 0, right: 0 }} />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTitleAlign: 'left',
          headerTitle: () => (
            <View style={[styles.titleRow, { maxWidth: titleMaxWidth }]}>
              <Star size={22} color={colors.danger} rotation={-14} style={styles.titleStar} />
              <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{t('settings.aboutTitle')}</Text>
            </View>
          ),
        }}
      />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  titleStar: { marginTop: 2 },
  title: { color: colors.text, fontFamily: fonts.prose, fontWeight: '700', fontSize: 28, flexShrink: 1 },
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
