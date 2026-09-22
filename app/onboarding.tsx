import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useMemo, useRef } from 'react'
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassSurface } from '@/components/Glass'
import { SFIcon } from '@/components/SFIcon'
import { setOnboardingComplete } from '@/db/onboarding'
import { useTranslation } from '@/i18n'
import { fonts, useColors } from '@/theme'

type Feature = {
  icon: Parameters<typeof SFIcon>[0]['name']
  fallback: Parameters<typeof SFIcon>[0]['fallback']
  titleKey: string
  textKey: string
}

const FEATURES: Feature[] = [
  {
    icon: 'person.crop.circle.badge.plus',
    fallback: 'person-add-outline',
    titleKey: 'onboarding.slide1.title',
    textKey: 'onboarding.slide1.text',
  },
  {
    icon: 'slider.horizontal.3',
    fallback: 'options-outline',
    titleKey: 'onboarding.slide2.title',
    textKey: 'onboarding.slide2.text',
  },
  {
    icon: 'server.rack',
    fallback: 'server-outline',
    titleKey: 'onboarding.slide3.title',
    textKey: 'onboarding.slide3.text',
  },
  {
    icon: 'lock.shield',
    fallback: 'shield-checkmark-outline',
    titleKey: 'onboarding.slide4.title',
    textKey: 'onboarding.slide4.text',
  },
]

// A single welcome sheet in the manner of Apple's own apps: what the app does, on one
// screen, and one way forward. The only motion is the content settling in once.
export default function OnboardingScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation()
  const appear = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(12)).current

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) rise.setValue(0)
      Animated.parallel([
        Animated.timing(appear, { toValue: 1, duration: 400, useNativeDriver: true }),
        // Critically damped: it settles without overshoot.
        Animated.spring(rise, { toValue: 0, stiffness: 180, damping: 27, mass: 1, useNativeDriver: true }),
      ]).start()
    })
  }, [appear, rise])

  const finish = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    await setOnboardingComplete(db, true)
    router.replace('/')
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 56 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: appear, transform: [{ translateY: rise }] }}>
          <View style={styles.mark}>
            <Text style={styles.markGlyph}>R</Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t('onboarding.welcomeTitle')}
          </Text>

          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.titleKey} style={styles.feature}>
                <View style={styles.featureIcon}>
                  <SFIcon name={f.icon} fallback={f.fallback} size={28} color={colors.accent} />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>{t(f.titleKey)}</Text>
                  <Text style={styles.featureText}>{t(f.textKey)}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + 16, opacity: appear }]}>
        <Pressable onPress={finish} style={({ pressed }) => pressed && { transform: [{ scale: 0.98 }] }}>
          <GlassSurface
            interactive
            tintColor={colors.accent}
            style={styles.cta}
            fallbackStyle={{ backgroundColor: colors.accent }}
          >
            <Text style={styles.ctaText}>{t('onboarding.getStarted')}</Text>
          </GlassSurface>
        </Pressable>
      </Animated.View>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 32, paddingBottom: 24 },
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
      marginBottom: 20,
    },
    markGlyph: { color: colors.accent, fontFamily: fonts.prose, fontSize: 32, fontWeight: '600' },
    title: {
      color: colors.text,
      fontSize: 34,
      lineHeight: 40,
      fontWeight: '700',
      letterSpacing: -0.6,
      textAlign: 'center',
      marginBottom: 44,
    },
    features: { gap: 28 },
    feature: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
    featureIcon: { width: 44, alignItems: 'center', paddingTop: 2 },
    featureCopy: { flex: 1 },
    featureTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 3 },
    featureText: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
    footer: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12 },
    cta: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  })
