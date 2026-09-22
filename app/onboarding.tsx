import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SFIcon } from '@/components/SFIcon'
import { setOnboardingComplete } from '@/db/onboarding'
import { fonts, useColors } from '@/theme'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.72)

type Slide = {
  icon: Parameters<typeof SFIcon>[0]['name']
  fallback: Parameters<typeof SFIcon>[0]['fallback']
  title: string
  text: string
}

const SLIDES: Slide[] = [
  {
    icon: 'person.crop.circle.badge.plus',
    fallback: 'person-add-outline',
    title: 'Свои персонажи',
    text: 'Задайте имя, характер и манеру речи — и начните разговор с чистого листа.',
  },
  {
    icon: 'slider.horizontal.3',
    fallback: 'options-outline',
    title: 'Полный контроль',
    text: 'Temperature, top-P, длина ответа — у каждого персонажа свои настройки генерации.',
  },
  {
    icon: 'server.rack',
    fallback: 'hardware-chip-outline',
    title: 'Ваша модель',
    text: 'Reverie говорит с сервером в вашей сети — LM Studio, Ollama, llama.cpp. Ничего не уходит наружу.',
  },
  {
    icon: 'lock.shield',
    fallback: 'shield-checkmark-outline',
    title: 'Всё остаётся у вас',
    text: 'Переписки и аватары хранятся только на этом устройстве, в локальной базе.',
  },
]

const PAGE_COUNT = SLIDES.length + 1

export default function OnboardingScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const scrollX = useRef(new Animated.Value(0)).current
  const welcomeIn = useRef(new Animated.Value(0)).current
  const [page, setPage] = useState(0)
  const lastPage = useRef(0)

  const onPageChange = (next: number) => {
    if (next === lastPage.current) return
    lastPage.current = next
    setPage(next)
    Haptics.impactAsync(next === PAGE_COUNT - 1 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)
  }

  useEffect(() => {
    welcomeIn.setValue(0)
    if (page !== PAGE_COUNT - 1) return
    Animated.spring(welcomeIn, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 8 }).start()
  }, [page, welcomeIn])

  const finish = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    await setOnboardingComplete(db, true)
    router.replace('/')
  }

  return (
    <View style={styles.screen}>
      <Hero />

      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        style={styles.scroll}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
          listener: (e: any) => onPageChange(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)),
        })}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={styles.page}>
            <View style={styles.copy}>
              <View style={styles.iconWrap}>
                <SFIcon name={slide.icon} fallback={slide.fallback} size={26} color={colors.text} />
              </View>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.text}>{slide.text}</Text>
            </View>
          </View>
        ))}

        <View style={styles.page}>
          <View style={styles.copy}>
            <Animated.View
              style={{
                opacity: welcomeIn,
                transform: [{ translateY: welcomeIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              }}
            >
              <View style={styles.iconWrap}>
                <SFIcon name="sparkles" fallback="sparkles-outline" size={26} color={colors.text} />
              </View>
              <Text style={styles.welcomeTitle}>Welcome to Reverie</Text>
              <Text style={styles.text}>Персонажи, истории и ваша собственная модель — в одном приватном чате.</Text>
            </Animated.View>
          </View>
        </View>
      </Animated.ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        {page === PAGE_COUNT - 1 ? (
          <Pressable onPress={finish} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>Get Started</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync()
              finish()
            }}
            hitSlop={8}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Text style={styles.skip}>Пропустить</Text>
          </Pressable>
        )}
        <View style={styles.dots}>
          {Array.from({ length: PAGE_COUNT }).map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      </View>
    </View>
  )
}

// A dense grid of oversized, heavily overlapping circles: the blur view on top only
// softens edges, it can't invent color where none of the circles reach, so the grid
// step has to be well under the circle size or gray background shows through the gaps.
const BLOB_SIZE = 260
const BLOB_STEP = 110

const buildBlobs = (colors: ReturnType<typeof useColors>) => {
  const palette = [colors.accent, '#5B34C9', '#C4B5FD'] as const
  const cols = Math.ceil(SCREEN_WIDTH / BLOB_STEP) + 2
  const rows = Math.ceil(HERO_HEIGHT / BLOB_STEP) + 2
  return Array.from({ length: cols * rows }, (_, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      size: BLOB_SIZE,
      top: row * BLOB_STEP - BLOB_SIZE / 2,
      left: col * BLOB_STEP - BLOB_SIZE / 2 + (row % 2 ? BLOB_STEP / 2 : 0),
      color: palette[(row + col) % palette.length],
    }
  })
}

function Hero() {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const blobs = useMemo(() => buildBlobs(colors), [colors])
  return (
    <View style={styles.hero} pointerEvents="none">
      {blobs.map((blob, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: blob.top,
            left: blob.left,
            width: blob.size,
            height: blob.size,
            borderRadius: blob.size / 2,
            backgroundColor: blob.color,
          }}
        />
      ))}
      <BlurView tint="dark" intensity={90} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['transparent', 'transparent', colors.bg]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: HERO_HEIGHT, overflow: 'hidden' },
  scroll: { flex: 1 },
  page: { width: SCREEN_WIDTH, height: '100%', alignItems: 'center' },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  copy: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 32, paddingBottom: 14 },
  title: { color: colors.text, fontFamily: fonts.prose, fontSize: 26, fontWeight: '600', marginBottom: 10 },
  welcomeTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 32, fontWeight: '600', marginBottom: 10 },
  text: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  footer: { paddingHorizontal: 24, alignItems: 'center', gap: 18 },
  cta: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  skip: { color: colors.textFaint, fontSize: 15, height: 52, textAlignVertical: 'center', lineHeight: 52 },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 18 },
})
