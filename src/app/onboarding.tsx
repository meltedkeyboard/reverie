import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
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

import { isDesktop } from '@/lib/core/platform'
import { Button } from '@/components/controls/Button'
import { Field, FieldLabel } from '@/components/controls/Field'
import { PickerBox } from '@/components/controls/PickerBox'
import { SFIcon } from '@/components/visuals/SFIcon'
import { Wordmark } from '@/components/visuals/Wordmark'
import { setOnboardingComplete } from '@/db/prefs/onboarding'
import { useDatabase } from '@/db/provider'
import { saveSettings } from '@/db/prefs/settings'
import { useServerForm } from '@/hooks/features/useServerForm'
import { useTranslation } from '@/i18n'
import { NativeMenu } from '@/components/overlays/NativeMenu'
import * as Haptics from '@/lib/ui/haptics'
import { APP_VERSION } from '@/lib/core/version'
import { type Colors, textStyles, useColors, useStyles } from '@/theme'

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
    icon: 'person.3',
    fallback: 'people-outline',
    titleKey: 'onboarding.rooms.title',
    textKey: 'onboarding.rooms.text',
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

// A welcome sheet in the manner of Apple's own apps: what the app does, on one screen,
// then the server to talk to, which can be left for later. The content settles in once,
// and the second page turns in from the right like the next page of a pager.
export default function OnboardingScreen() {
  const db = useDatabase()
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
  const { cfg, update, status, models, modelItems, onTest } = useServerForm()
  const welcomeScroll = useFitScroll()
  const serverScroll = useFitScroll()

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

  const finish = async (saveServer: boolean) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    if (saveServer) await saveSettings(db, { ...cfg, baseUrl: cfg.baseUrl.trim() })
    await setOnboardingComplete(db, true)
    router.replace('/')
  }

  const hasAddress = cfg.baseUrl.trim().length > 0
  // The one button at the bottom leads through the setup: it tests the server first,
  // asks for a model while the server has several and none is picked, and then finishes.
  const connected = status.kind === 'ok'
  const modelPicked = models.length <= 1 || models.includes(cfg.model)
  const mainButton = !connected
    ? { label: t('settings.testConnection'), onPress: onTest, disabled: !hasAddress }
    : !modelPicked
      ? { label: t('onboarding.pickModel'), onPress: () => {}, disabled: false }
      : { label: t('onboarding.done'), onPress: () => finish(true), disabled: false }
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
                      <SFIcon name={f.icon} fallback={f.fallback} size={28} color={colors.text} />
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
          {/* Tucked in a corner, to tell which build is installed without drawing the eye. */}
          <Animated.Text style={[styles.version, { top: insets.top + 8, opacity: appear }]} pointerEvents="none">
            v{APP_VERSION}
          </Animated.Text>
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
                <SFIcon name="server.rack" fallback="server-outline" size={44} color={colors.text} />
              </View>
              <Text style={[styles.title, styles.pageTitle]} accessibilityRole="header">
                {t('onboarding.serverTitle')}
              </Text>
              <Text style={styles.pageText}>{t('onboarding.serverText')}</Text>

              {/* Straight on the page, as in Settings: glass over a filled card turns into a
                  grey haze in the dark scheme. */}
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
                <View style={styles.modelWrap}>
                  <FieldLabel>{t('settings.modelLabel')}</FieldLabel>
                  <PickerBox
                    value={modelPicked ? cfg.model : ''}
                    placeholder={t('onboarding.pickModel')}
                    items={modelItems(models)}
                    accessibilityLabel={t('settings.modelLabel')}
                    fallbackStyle={styles.modelSolid}
                  />
                </View>
              ) : null}

              {status.kind === 'ok' || status.kind === 'error' ? (
                <Text style={styles.statusText}>{status.text}</Text>
              ) : null}
              <Text style={styles.later}>{t('onboarding.serverLater')}</Text>
            </View>
          </KeyboardAwareScrollView>
          <Animated.View style={footerStyle}>
            {/* While a model is to be picked the button is the menu's trigger, which opens on the tap. */}
            {connected && !modelPicked ? (
              <NativeMenu items={modelItems(models)}>
                <Button variant="glass" label={mainButton.label} onPress={mainButton.onPress} />
              </NativeMenu>
            ) : (
              <Button
                variant="glass"
                label={mainButton.label}
                onPress={mainButton.onPress}
                disabled={mainButton.disabled}
                loading={status.kind === 'testing'}
              />
            )}
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
    version: { position: 'absolute', right: 20, color: colors.textFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
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
    // Laid out as a Field, so the model sits in line with the address and the key.
    modelWrap: { marginBottom: 20 },
    modelSolid: { borderRadius: isDesktop ? 8 : 14, backgroundColor: colors.surface, borderWidth: isDesktop ? 0 : 1, borderColor: colors.border },
    statusText: { ...textStyles(colors).note, textAlign: 'center', marginTop: 14 },
    later: { color: colors.textFaint, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 14, marginHorizontal: 8 },
    footer: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12 },
    skip: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
    skipText: { color: colors.textMuted, fontSize: 16, fontWeight: '500' },
  })
