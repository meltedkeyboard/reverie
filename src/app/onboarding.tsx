import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { KeyboardAwareScrollView, useKeyboardState } from 'react-native-keyboard-controller'
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { isDesktop, isWeb } from '@/lib/core/platform'
import { Button } from '@/components/controls/Button'
import { Field, FieldLabel } from '@/components/controls/Field'
import { PickerBox } from '@/components/controls/PickerBox'
import { LIST_TOP, NativeForm, NativeHostedRow, NativePickerRow, NativeSection, NativeTextRow, nativeForm } from '@/components/lists/NativeForm'
import { primeLocalNetworkAccess } from '@/api/llm'
import { SFIcon } from '@/components/visuals/SFIcon'
import { setOnboardingComplete } from '@/db/prefs/onboarding'
import { useDatabase } from '@/db/provider'
import { addServer, setActiveServer } from '@/db/prefs/settings'
import { useServerDiscovery } from '@/hooks/features/useServerDiscovery'
import { useServerForm } from '@/hooks/features/useServerForm'
import type { FoundServer } from '@/api/discover'
import { FoundServersGroup, FoundServersSection } from '@/components/lists/FoundServers'
import { useTranslation } from '@/i18n'
import { NativeMenu } from '@/components/overlays/NativeMenu'
import * as Haptics from '@/lib/ui/haptics'
import { APP_VERSION_BUILD } from '@/lib/core/version'
import { type Colors, textStyles, useColors, useStyles } from '@/theme'

type Feature = {
  icon: Parameters<typeof SFIcon>[0]['name']
  fallback: Parameters<typeof SFIcon>[0]['fallback']
  titleKey: string
  textKey: string
}

type Section = { titleKey: string; features: Feature[] }

// The whole of what the app does, in the order a story is made: who is in it, where they
// meet, what happens in a chat, what is remembered, what runs it, how it looks, and where
// it is kept.
const SECTIONS: Section[] = [
  {
    titleKey: 'onboarding.section.characters',
    features: [
      { icon: 'person.crop.circle.badge.plus', fallback: 'person-add-outline', titleKey: 'onboarding.characters.title', textKey: 'onboarding.characters.text' },
      { icon: 'square.and.arrow.down', fallback: 'download-outline', titleKey: 'onboarding.cards.title', textKey: 'onboarding.cards.text' },
      { icon: 'photo.on.rectangle.angled', fallback: 'images-outline', titleKey: 'onboarding.gallery.title', textKey: 'onboarding.gallery.text' },
      { icon: 'folder', fallback: 'folder-outline', titleKey: 'onboarding.groups.title', textKey: 'onboarding.groups.text' },
      { icon: 'archivebox', fallback: 'archive-outline', titleKey: 'onboarding.archive.title', textKey: 'onboarding.archive.text' },
    ],
  },
  {
    titleKey: 'onboarding.section.rooms',
    features: [
      { icon: 'person.3', fallback: 'people-outline', titleKey: 'onboarding.rooms.title', textKey: 'onboarding.rooms.text' },
      { icon: 'megaphone', fallback: 'megaphone-outline', titleKey: 'onboarding.director.title', textKey: 'onboarding.director.text' },
      { icon: 'heart.text.square', fallback: 'heart-outline', titleKey: 'onboarding.secrets.title', textKey: 'onboarding.secrets.text' },
      { icon: 'wand.and.stars', fallback: 'sparkles-outline', titleKey: 'onboarding.setup.title', textKey: 'onboarding.setup.text' },
    ],
  },
  {
    titleKey: 'onboarding.section.chat',
    features: [
      { icon: 'arrow.triangle.2.circlepath', fallback: 'refresh-outline', titleKey: 'onboarding.refine.title', textKey: 'onboarding.refine.text' },
      { icon: 'arrow.triangle.branch', fallback: 'git-branch-outline', titleKey: 'onboarding.branches.title', textKey: 'onboarding.branches.text' },
      { icon: 'signpost.right', fallback: 'navigate-outline', titleKey: 'onboarding.direction.title', textKey: 'onboarding.direction.text' },
      { icon: 'eye', fallback: 'eye-outline', titleKey: 'onboarding.aside.title', textKey: 'onboarding.aside.text' },
      { icon: 'text.bubble', fallback: 'chatbubble-ellipses-outline', titleKey: 'onboarding.suggest.title', textKey: 'onboarding.suggest.text' },
      { icon: 'brain', fallback: 'bulb-outline', titleKey: 'onboarding.thinking.title', textKey: 'onboarding.thinking.text' },
      { icon: 'photo', fallback: 'image-outline', titleKey: 'onboarding.pictures.title', textKey: 'onboarding.pictures.text' },
    ],
  },
  {
    titleKey: 'onboarding.section.memory',
    features: [
      { icon: 'books.vertical', fallback: 'library-outline', titleKey: 'onboarding.memory.title', textKey: 'onboarding.memory.text' },
      { icon: 'book.closed', fallback: 'book-outline', titleKey: 'onboarding.lorebooks.title', textKey: 'onboarding.lorebooks.text' },
      { icon: 'theatermasks', fallback: 'happy-outline', titleKey: 'onboarding.personas.title', textKey: 'onboarding.personas.text' },
    ],
  },
  {
    titleKey: 'onboarding.section.model',
    features: [
      { icon: 'server.rack', fallback: 'server-outline', titleKey: 'onboarding.server.title', textKey: 'onboarding.server.text' },
      { icon: 'arrow.left.arrow.right', fallback: 'swap-horizontal-outline', titleKey: 'onboarding.failover.title', textKey: 'onboarding.failover.text' },
      { icon: 'cpu', fallback: 'hardware-chip-outline', titleKey: 'onboarding.models.title', textKey: 'onboarding.models.text' },
    ],
  },
  {
    titleKey: 'onboarding.section.look',
    features: [
      { icon: 'paintpalette', fallback: 'color-palette-outline', titleKey: 'onboarding.themes.title', textKey: 'onboarding.themes.text' },
      { icon: 'photo.artframe', fallback: 'easel-outline', titleKey: 'onboarding.backgrounds.title', textKey: 'onboarding.backgrounds.text' },
      { icon: 'app.badge', fallback: 'apps-outline', titleKey: 'onboarding.icons.title', textKey: 'onboarding.icons.text' },
    ],
  },
  {
    titleKey: 'onboarding.section.data',
    features: [
      { icon: 'icloud', fallback: 'cloud-outline', titleKey: 'onboarding.sync.title', textKey: 'onboarding.sync.text' },
      { icon: 'archivebox', fallback: 'archive-outline', titleKey: 'onboarding.backups.title', textKey: 'onboarding.backups.text' },
    ],
  },
]

const DISCOVER_PAGE = 2
const SERVER_PAGE = 3
// Critically damped, as the content's rise: the page settles without swinging past.
const PAGE_SPRING = { stiffness: 170, damping: 26, mass: 1 }

// The sizes of the title page are taken from Apple News' welcome page: the margins, the
// title as Title 1 and the line under it as Title 2. wordmark-welcome.svg's viewBox has
// the spark sticking out up and to the left of the letters; the letters are as tall as the
// capitals of the title and the spark hangs in the margin, so they line up with the text.
const WORDMARK = { x: -499, width: 7673, height: 1448, letters: 1058 }
const WORDMARK_SCALE = 20 / WORDMARK.letters
const SIDE = 38

// Welcome pages in the manner of Apple's own apps: a title page with the logo and a word
// on privacy at its foot, what the app does, the servers found in the local network, then
// the server to talk to, filled in from the one picked or typed by hand, which can be left
// for later. The content settles in once, and the pages turn as those of a pager: by the
// buttons, or dragged by the finger either way.
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
  // Which page is in view, fractional while the pages move, on the UI thread so a drag
  // follows the finger frame by frame.
  const turn = useSharedValue(0)
  const reduceMotion = useReducedMotion()
  const [page, setPage] = useState(0)
  const pageNow = useSharedValue(0)
  const { cfg, update, status, models, modelItems, onTest } = useServerForm()
  const welcomeScroll = useFitScroll()
  const featuresScroll = useFitScroll()
  const discoverScroll = useFitScroll()
  // The height of the search page's intro, and of the page above its footer.
  const [introHeight, setIntroHeight] = useState(0)
  const [discoverRoom, setDiscoverRoom] = useState(0)
  const discovery = useServerDiscovery()
  const [picked, setPicked] = useState<FoundServer | null>(null)
  // The address of a found server whose connection is tested as soon as it is in the form.
  const testOnArrival = useRef<string | null>(null)

  useEffect(() => {
    if (!testOnArrival.current || cfg.baseUrl !== testOnArrival.current) return
    testOnArrival.current = null
    onTest()
  }, [cfg.baseUrl])

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) rise.setValue(0)
      Animated.parallel([
        Animated.timing(appear, { toValue: 1, duration: 400, useNativeDriver: !isWeb }),
        // Critically damped: it settles without overshoot.
        Animated.spring(rise, { toValue: 0, stiffness: 180, damping: 27, mass: 1, useNativeDriver: !isWeb }),
      ]).start()
    })
  }, [appear, rise])

  // What a page does as it comes into view, turned to by a button or a drag.
  const arrive = (to: number) => {
    if (to === page) return
    Haptics.selectionAsync()
    setPage(to)
    pageNow.value = to
    // The keyboard of the server's fields does not stay up over the other pages.
    if (page === SERVER_PAGE) Keyboard.dismiss()
    // The search asks for local network access itself, before its first request.
    if (to === DISCOVER_PAGE && discovery.state === 'idle') discovery.search()
    if (to === SERVER_PAGE) primeLocalNetworkAccess(cfg.baseUrl)
  }

  const turnTo = (to: number) => {
    arrive(to)
    turn.value = reduceMotion ? to : withSpring(to, PAGE_SPRING)
  }
  const next = () => turnTo(page + 1)

  // The pages follow a sideways drag and are held back past the first and the last. Let go,
  // they settle on the page the drag and its speed point to, one page at most, the spring
  // taking on the finger's speed. The title page is left only by its button, so the drag
  // starts working from the page after it.
  const drag = Gesture.Pan()
    .enabled(page !== 0)
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const at = pageNow.value - e.translationX / width
      turn.value = at < 0 ? at / 3 : at > SERVER_PAGE ? SERVER_PAGE + (at - SERVER_PAGE) / 3 : at
    })
    .onEnd((e) => {
      const from = pageNow.value
      const aimed = Math.round(turn.value - (e.velocityX / width) * 0.25)
      const to = Math.min(Math.max(aimed, from - 1, 0), from + 1, SERVER_PAGE)
      turn.value = reduceMotion ? to : withSpring(to, { ...PAGE_SPRING, velocity: -e.velocityX / width })
      scheduleOnRN(arrive, to)
    })

  const pagesStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -turn.value * width }] }))

  // A tap on a found server checks it, a second one unchecks it.
  const pick = (server: FoundServer) => {
    Haptics.selectionAsync()
    setPicked((prev) => (prev?.baseUrl === server.baseUrl ? null : server))
  }

  // The picked server fills the form, named for what it is, its only model taken as it is,
  // and the connection is tested on the way so the next page comes up already answered.
  const takePicked = () => {
    if (!picked) return turnTo(SERVER_PAGE)
    update({
      name: picked.kind,
      baseUrl: picked.baseUrl,
      ...(picked.models.length === 1 ? { model: picked.models[0] } : {}),
    })
    if (!picked.locked) testOnArrival.current = picked.baseUrl
    turnTo(SERVER_PAGE)
  }

  // The pages off screen are kept from VoiceOver and TalkBack.
  const pageProps = (index: number) => ({
    style: { width },
    accessibilityElementsHidden: page !== index,
    importantForAccessibility: page === index ? ('auto' as const) : ('no-hide-descendants' as const),
  })

  const finish = async (saveServer: boolean) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    if (saveServer) {
      const { id: _id, ...fields } = cfg
      const added = await addServer(db, { ...fields, baseUrl: cfg.baseUrl.trim() })
      await setActiveServer(db, added.id)
    }
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
  const contentPad = [
    styles.content,
    {
      paddingTop: insets.top + 56,
      paddingLeft: Math.max(SIDE, insets.left + 16),
      paddingRight: Math.max(SIDE, insets.right + 16),
    },
  ]
  // A part's heading reaches out over the content's side padding to the screen's edges, so its
  // fill hides the icons that stand a little past the text's column as they scroll under it.
  const headingBleed = {
    marginLeft: -Math.max(SIDE, insets.left + 16),
    marginRight: -Math.max(SIDE, insets.right + 16),
    paddingLeft: Math.max(SIDE, insets.left + 16),
    paddingRight: Math.max(SIDE, insets.right + 16),
  }
  // Only a transform on the footers: a fading ancestor leaves the Liquid Glass effect
  // unrendered until the app comes back from the background.
  const footerStyle = [
    styles.footer,
    {
      paddingBottom: Math.max(insets.bottom + 3, 20),
      paddingLeft: Math.max(SIDE, insets.left + 16),
      paddingRight: Math.max(SIDE, insets.right + 16),
      transform: [{ translateY: rise }],
    },
  ]

  const pageIntro = (title: string, text: string, onLayout?: (e: LayoutChangeEvent) => void) => (
    <View style={nativeForm ? styles.nativeIntro : undefined} onLayout={onLayout}>
      <Text style={[styles.title, styles.pageTitle]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[styles.pageText, nativeForm && styles.nativePageText]}>{text}</Text>
    </View>
  )
  const serverIntro = pageIntro(t('onboarding.serverTitle'), t('onboarding.serverText'))
  const discoverIntro = pageIntro(t('onboarding.discoverTitle'), t('onboarding.discoverText'), (e) =>
    setIntroHeight(e.nativeEvent.layout.height),
  )
  const markOf = (server: FoundServer) => (picked?.baseUrl === server.baseUrl ? ('picked' as const) : null)

  // The system's list scrolls whether its content fits or not, and does not say how tall its
  // content is, so whether the search page fits is reckoned from the rows of the list: the
  // intro as laid out, the group's header and note, a row of two lines for each server and the
  // row that searches. Short of room, it scrolls.
  const discoverHeight =
    insets.top + LIST_TOP + 24 + introHeight + LIST_TOP + 36 + discovery.found.length * 60 + 44 + 60
  const discoverFits = discoverRoom > 0 && discoverHeight <= discoverRoom

  return (
    <View style={styles.screen}>
      <GestureDetector gesture={drag}>
        <Reanimated.View style={[styles.pages, { width: width * (SERVER_PAGE + 1) }, pagesStyle]}>
          <View {...pageProps(0)}>
            <ScrollView {...welcomeScroll.scroll} contentContainerStyle={[contentPad, { paddingTop: insets.top + 76 }]} showsVerticalScrollIndicator={false}>
              <Animated.View onLayout={welcomeScroll.onContentLayout} style={{ opacity: appear, transform: [{ translateY: rise }] }}>
                {/* "Welcome to" with the logo for the app's name, read out as one heading. */}
                <View accessible accessibilityRole="header" accessibilityLabel={`${t('onboarding.welcomeTo')} Reverie`}>
                  <Text style={styles.welcomeTo}>{t('onboarding.welcomeTo')}</Text>
                  <View style={styles.nameLine}>
                    <Image source={require('../../assets/brand/wordmark-welcome.svg')} style={styles.wordmark} />
                  </View>
                </View>
                <Text style={styles.tagline}>{t('onboarding.tagline')}</Text>
              </Animated.View>
            </ScrollView>
            <Animated.View style={footerStyle}>
              <View style={styles.privacy}>
                <SFIcon name="hand.raised.fill" fallback="hand-left-outline" size={24} color={colors.accent} />
                <Text style={styles.privacyText}>{t('onboarding.privacy')}</Text>
              </View>
              <Button variant="solid" label={t('onboarding.continue')} onPress={next} />
            </Animated.View>
            {/* Tucked in a corner, to tell which build is installed without drawing the eye. */}
            <Animated.Text
              style={[
                styles.version,
                {
                  top: insets.top + 8,
                  right: Math.max(20, insets.right + 8),
                  opacity: appear,
                },
              ]}
              pointerEvents="none"
            >
              v{APP_VERSION_BUILD}
            </Animated.Text>
          </View>

          <View {...pageProps(1)}>
            {/* The headings of the parts stay at the top while their rows scroll under them, until
                the next one pushes them out. A heading sticks at the scroll view's top, so the view
                starts under the status bar rather than behind it, and the headings are direct
                children of its content, every other one from the second on. */}
            <ScrollView
              {...featuresScroll.scroll}
              style={{ marginTop: insets.top }}
              contentContainerStyle={[contentPad, { paddingTop: 56 }]}
              stickyHeaderIndices={SECTIONS.map((_, i) => 1 + i * 2)}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.title, styles.featuresTitle]} accessibilityRole="header">
                {t('onboarding.featuresTitle')}
              </Text>
              {SECTIONS.flatMap((section, i) => [
                <View key={`${section.titleKey}.heading`} style={[styles.sectionHeading, headingBleed]}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t(section.titleKey)}
                  </Text>
                </View>,
                <View
                  key={section.titleKey}
                  style={[styles.features, styles.section]}
                  onLayout={i === SECTIONS.length - 1 ? featuresScroll.onContentLayout : undefined}
                >
                  {section.features.map((f) => (
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
                </View>,
              ])}
            </ScrollView>
            <Animated.View style={footerStyle}>
              <Button variant="solid" label={t('onboarding.continue')} onPress={next} />
            </Animated.View>
          </View>

          <View {...pageProps(DISCOVER_PAGE)}>
            {nativeForm ? (
              <View style={styles.fill} onLayout={(e) => setDiscoverRoom(e.nativeEvent.layout.height)}>
                <NativeForm modifiers={[nativeForm.modifiers.scrollDisabled(discoverFits)]}>
                  <NativeSection inset={24}>
                    <NativeHostedRow clear>{discoverIntro}</NativeHostedRow>
                  </NativeSection>
                  <FoundServersSection discovery={discovery} markOf={markOf} onPick={pick} />
                </NativeForm>
              </View>
            ) : (
              <ScrollView {...discoverScroll.scroll} contentContainerStyle={contentPad} showsVerticalScrollIndicator={false}>
                <View onLayout={discoverScroll.onContentLayout}>
                  {discoverIntro}
                  <FoundServersGroup discovery={discovery} markOf={markOf} onPick={pick} />
                </View>
              </ScrollView>
            )}
            <Animated.View style={footerStyle}>
              <Button variant="solid" label={t(picked ? 'onboarding.continue' : 'onboarding.byHand')} onPress={takePicked} />
              <Pressable onPress={() => finish(false)} hitSlop={8} style={({ pressed }) => [styles.skip, pressed && { opacity: 0.5 }]}>
                <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
              </Pressable>
            </Animated.View>
          </View>

          <View {...pageProps(SERVER_PAGE)}>
            {nativeForm ? (
              // The fields as Settings has them, the system's own list (iOS with SwiftUI); the
              // icon and the words over it stay React Native views in a clear row of their own.
              <NativeForm modifiers={[nativeForm.modifiers.scrollDisabled(true)]}>
                <NativeSection inset={24}>
                  <NativeHostedRow clear>{serverIntro}</NativeHostedRow>
                </NativeSection>
                <NativeSection
                  title={t('settings.server')}
                  footer={[
                    { text: t('settings.baseUrlHint') },
                    ...(status.kind === 'ok' || status.kind === 'error' ? [{ text: status.text, danger: status.kind === 'error' }] : []),
                    { text: t('onboarding.serverLater') },
                  ]}
                >
                  <NativeTextRow
                    label={t('settings.baseUrlLabel')}
                    value={cfg.baseUrl}
                    onChangeText={(baseUrl) => update({ baseUrl })}
                    placeholder={t('settings.baseUrlPlaceholder')}
                    keyboard="url"
                    plain
                  />
                  <NativeTextRow
                    label={t('settings.apiKeyLabel')}
                    value={cfg.apiKey}
                    onChangeText={(apiKey) => update({ apiKey })}
                    placeholder={t('settings.apiKeyPlaceholder')}
                    secure
                  />
                  {/* Typed by hand until the server has listed its models, then picked from them. */}
                  {models.length > 0 ? (
                    <NativePickerRow
                      label={t('settings.modelLabel')}
                      value={cfg.model}
                      options={models}
                      placeholder={t('onboarding.pickModel')}
                      onChange={(model) => update({ model })}
                    />
                  ) : (
                    <NativeTextRow
                      label={t('settings.modelLabel')}
                      value={cfg.model}
                      onChangeText={(model) => update({ model })}
                      placeholder={t('settings.modelPlaceholder')}
                      plain
                    />
                  )}
                </NativeSection>
              </NativeForm>
            ) : (
              <KeyboardAwareScrollView
                scrollEnabled={false}
                bounces={false}
                overScrollMode="never"
                bottomOffset={24}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={contentPad}
                showsVerticalScrollIndicator={false}
              >
                <View>
                  {serverIntro}

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

                  {models.length > 0 ? (
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
            )}
            <Animated.View style={footerStyle}>
              {/* While a model is to be picked the button is the menu's trigger, which opens on the tap. */}
              {connected && !modelPicked ? (
                <NativeMenu items={modelItems(models)}>
                  <Button variant="solid" label={mainButton.label} onPress={mainButton.onPress} />
                </NativeMenu>
              ) : (
                <Button
                  variant="solid"
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
        </Reanimated.View>
      </GestureDetector>
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
    // The line before the name is in the text's color, since the logo already carries the accent.
    welcomeTo: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.38 },
    // A line of the title's height, with the letters standing on its baseline.
    nameLine: { height: 34 },
    wordmark: {
      width: WORDMARK.width * WORDMARK_SCALE,
      height: WORDMARK.height * WORDMARK_SCALE,
      marginLeft: WORDMARK.x * WORDMARK_SCALE,
    },
    tagline: { color: colors.textMuted, fontSize: 22, lineHeight: 28, letterSpacing: -0.26 },
    privacy: { gap: 14, marginBottom: 20 },
    privacyText: { color: colors.textMuted, fontSize: 11, lineHeight: 13, letterSpacing: 0.07 },
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
    // Each part of the overview headed as a Title 3 of its own, further from the next part
    // than its rows are from each other. The heading is filled with the page's color, so the
    // rows scrolling under it while it stays are hidden.
    // With the first heading's own room above it, as far under the title as before.
    featuresTitle: { marginBottom: 32 },
    section: { marginBottom: 28 },
    sectionHeading: { backgroundColor: colors.bg, paddingTop: 12, paddingBottom: 16 },
    sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.45 },
    features: { gap: 24 },
    feature: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
    featureIcon: { width: 44, alignItems: 'center', paddingTop: 2 },
    featureCopy: { flex: 1 },
    featureTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 3 },
    featureText: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
    fill: { flex: 1 },
    pageTitle: { marginBottom: 12 },
    pageText: { color: colors.textMuted, fontSize: 16, lineHeight: 22, textAlign: 'center', marginBottom: 32 },
    // In a row of the system's list, which gives it the list's own margins and the room
    // under it before the fields' group.
    nativeIntro: { paddingHorizontal: 16 },
    nativePageText: { marginBottom: 0 },
    // Laid out as a Field, so the model sits in line with the address and the key.
    modelWrap: { marginBottom: 20 },
    modelSolid: { borderRadius: isDesktop ? 8 : 14, backgroundColor: colors.surface, borderWidth: isDesktop ? 0 : 1, borderColor: colors.border },
    statusText: { ...textStyles(colors).note, textAlign: 'center', marginTop: 14 },
    later: { color: colors.textFaint, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 14, marginHorizontal: 8 },
    footer: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12 },
    skip: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
    skipText: { color: colors.textMuted, fontSize: 16, fontWeight: '500' },
  })
