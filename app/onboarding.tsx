import { useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { KeyboardAwareScrollView, useKeyboardState } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { testConnection } from '@/api/llm'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Group } from '@/components/Group'
import { SFIcon } from '@/components/SFIcon'
import { Wordmark } from '@/components/Wordmark'
import { setOnboardingComplete } from '@/db/onboarding'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ServerSettings } from '@/db/settings'
import { useTranslation } from '@/i18n'
import { errorMessage } from '@/lib/errors'
import * as Haptics from '@/lib/haptics'
import { useColors, useStyles, type Colors } from '@/theme'

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

type Status = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' | 'error'; text: string }

// A welcome sheet in the manner of Apple's own apps: what the app does, on one screen,
// then the server to talk to, which can be left for later. The content settles in once,
// and the second page turns in from the right like the next page of a pager.
export default function OnboardingScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const appear = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(12)).current
  const turn = useRef(new Animated.Value(0)).current
  const [onServer, setOnServer] = useState(false)
  const [cfg, setCfg] = useState<ServerSettings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [models, setModels] = useState<string[]>([])
  const welcomeScroll = useFitScroll()
  const serverScroll = useFitScroll()

  // Someone going through onboarding again sees the server they already have.
  useEffect(() => {
    loadSettings(db).then(setCfg)
  }, [db])

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

  const toServer = () => {
    Haptics.selectionAsync()
    setOnServer(true)
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) turn.setValue(1)
      else Animated.spring(turn, { toValue: 1, stiffness: 170, damping: 26, mass: 1, useNativeDriver: true }).start()
    })
  }

  const update = (patch: Partial<ServerSettings>) => {
    setCfg((prev) => ({ ...prev, ...patch }))
    if (patch.baseUrl !== undefined || patch.apiKey !== undefined) setStatus({ kind: 'idle' })
  }

  const onTest = async () => {
    setStatus({ kind: 'testing' })
    try {
      const found = await testConnection(cfg)
      setModels(found)
      // A single model on the server is the one to talk to.
      if (found.length === 1) update({ model: found[0] })
      setStatus({
        kind: 'ok',
        text: found.length ? t('settings.connectedWithModels', { count: found.length }) : t('settings.connected'),
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      setModels([])
      setStatus({ kind: 'error', text: errorMessage(err) })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  const finish = async (saveServer: boolean) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    if (saveServer) await saveSettings(db, { ...cfg, baseUrl: cfg.baseUrl.trim() })
    await setOnboardingComplete(db, true)
    router.replace('/')
  }

  const hasAddress = cfg.baseUrl.trim().length > 0
  const contentPad = [styles.content, { paddingTop: insets.top + 56 }]
  // Only a transform on the footers: a fading ancestor leaves the Liquid Glass effect
  // unrendered until the app comes back from the background.
  const footerStyle = [styles.footer, { paddingBottom: insets.bottom + 16, transform: [{ translateY: rise }] }]

  return (
    <View style={styles.screen}>
      <Animated.View
        style={[
          styles.pages,
          { width: width * 2, transform: [{ translateX: turn.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }] },
        ]}
      >
        {/* The page off screen is kept from VoiceOver and TalkBack. */}
        <View style={{ width }} accessibilityElementsHidden={onServer} importantForAccessibility={onServer ? 'no-hide-descendants' : 'auto'}>
          <ScrollView {...welcomeScroll.scroll} contentContainerStyle={contentPad} showsVerticalScrollIndicator={false}>
            <Animated.View onLayout={welcomeScroll.onContentLayout} style={{ opacity: appear, transform: [{ translateY: rise }] }}>
              <Wordmark width={260} optical style={styles.wordmark} />
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
          <Animated.View style={footerStyle}>
            <Button variant="glass" label={t('onboarding.getStarted')} onPress={toServer} />
          </Animated.View>
        </View>

        <View style={{ width }} accessibilityElementsHidden={!onServer} importantForAccessibility={onServer ? 'auto' : 'no-hide-descendants'}>
          <KeyboardAwareScrollView
            {...serverScroll.scroll}
            bottomOffset={24}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={contentPad}
            showsVerticalScrollIndicator={false}
          >
            <View onLayout={serverScroll.onContentLayout}>
              <View style={styles.pageIcon}>
                <SFIcon name="server.rack" fallback="server-outline" size={44} color={colors.accent} />
              </View>
              <Text style={[styles.title, styles.pageTitle]} accessibilityRole="header">
                {t('onboarding.serverTitle')}
              </Text>
              <Text style={styles.pageText}>{t('onboarding.serverText')}</Text>

              <Group>
                <View style={styles.cardPad}>
                  <Field
                    label={t('settings.baseUrlLabel')}
                    value={cfg.baseUrl}
                    onChangeText={(baseUrl) => update({ baseUrl })}
                    placeholder={t('settings.baseUrlPlaceholder')}
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Field
                    label={t('settings.apiKeyLabel')}
                    hint={t('settings.apiKeyHint')}
                    value={cfg.apiKey}
                    onChangeText={(apiKey) => update({ apiKey })}
                    placeholder={t('settings.apiKeyPlaceholder')}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  {models.length > 1 ? (
                    <View style={styles.chips}>
                      {models.map((id) => {
                        const active = id === cfg.model
                        return (
                          <Pressable
                            key={id}
                            onPress={() => update({ model: id })}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, active && { color: colors.accent }]} numberOfLines={1}>
                              {id}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  ) : null}

                  <Button
                    variant="soft"
                    label={t('settings.testConnection')}
                    onPress={onTest}
                    loading={status.kind === 'testing'}
                    disabled={!hasAddress}
                  />

                  {status.kind === 'ok' || status.kind === 'error' ? (
                    <Text style={styles.statusText}>{status.text}</Text>
                  ) : null}
                </View>
              </Group>
              <Text style={styles.later}>{t('onboarding.serverLater')}</Text>
            </View>
          </KeyboardAwareScrollView>
          <Animated.View style={footerStyle}>
            <Button variant="glass" label={t('onboarding.done')} onPress={() => finish(true)} disabled={!hasAddress} />
            <Pressable
              onPress={() => finish(false)}
              hitSlop={8}
              style={({ pressed }) => [styles.skip, pressed && { opacity: 0.5 }]}
            >
              <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  )
}

// A page that fits on the screen stands still. The content size of a scroll view counts
// its bottom padding too, so it runs a little past the screen even when everything is in
// view; what is measured instead is where the last of the content ends. It also scrolls
// while the keyboard is up, so the fields under it can still be reached.
function useFitScroll() {
  const [viewport, setViewport] = useState(0)
  const [bottom, setBottom] = useState(0)
  const keyboard = useKeyboardState((state) => state.isVisible)
  const scrolls = keyboard || (viewport > 0 && bottom > viewport)
  return {
    scroll: {
      scrollEnabled: scrolls,
      bounces: scrolls,
      overScrollMode: 'never' as const,
      onLayout: (e: LayoutChangeEvent) => setViewport(e.nativeEvent.layout.height),
    },
    onContentLayout: (e: LayoutChangeEvent) => setBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height),
  }
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
    pages: { flex: 1, flexDirection: 'row' },
    content: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 32, paddingBottom: 24 },
    wordmark: { alignSelf: 'center', marginBottom: 28 },
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
    pageIcon: { alignSelf: 'center', marginBottom: 20 },
    pageTitle: { marginBottom: 12 },
    pageText: { color: colors.textMuted, fontSize: 16, lineHeight: 22, textAlign: 'center', marginBottom: 32 },
    cardPad: { padding: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -6, marginBottom: 16 },
    chip: {
      maxWidth: '100%',
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    chipText: { color: colors.textMuted, fontSize: 13 },
    statusText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 14 },
    later: { color: colors.textFaint, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 14, marginHorizontal: 8 },
    footer: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12 },
    skip: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
    skipText: { color: colors.textMuted, fontSize: 16, fontWeight: '500' },
  })
