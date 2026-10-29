import { BlurView } from 'expo-blur'
import * as LocalAuthentication from 'expo-local-authentication'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated as RNAnimated, AppState, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '@/components/controls/Button'
import { SFIcon } from '@/components/visuals/SFIcon'
import { splashDone } from '@/components/startup/SplashOverlay'
import { isAppLockEnabled, isAppLockEnabledCached } from '@/db/prefs/appLock'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/ui/haptics'
import { FILL, useColors, useTheme } from '@/theme'
import { isAndroid, isWeb } from '@/lib/core/platform'

// The way this phone unlocks, which the button names.
type Way = 'faceId' | 'touchId' | 'fingerprint' | 'passcode'

const WAYS = {
  faceId: { label: 'lock.faceId', symbol: 'faceid', icon: 'scan-outline' },
  touchId: { label: 'lock.touchId', symbol: 'touchid', icon: 'finger-print-outline' },
  fingerprint: { label: 'lock.fingerprint', symbol: 'touchid', icon: 'finger-print-outline' },
  passcode: { label: 'lock.unlock', symbol: 'lock.open.fill', icon: 'lock-open-outline' },
} as const

async function unlockWay(): Promise<Way> {
  const [types, enrolled] = await Promise.all([
    LocalAuthentication.supportedAuthenticationTypesAsync().catch((): LocalAuthentication.AuthenticationType[] => []),
    LocalAuthentication.isEnrolledAsync().catch(() => false),
  ])
  if (!enrolled) return 'passcode'
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'faceId'
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return isAndroid ? 'fingerprint' : 'touchId'
  return 'passcode'
}

// Covers the app with a lock screen until Face ID, a fingerprint or the passcode succeeds — on launch
// and after the app has been in the background. It also blurs the app in the app
// switcher while the lock is on.
export function AppLock({ children }: { children: ReactNode }) {
  const db = useDatabase()
  const colors = useColors()
  const { scheme } = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [locked, setLocked] = useState(true)
  const [shielded, setShielded] = useState(false)
  const [checked, setChecked] = useState(false)
  const [way, setWay] = useState<Way>('passcode')
  const busy = useRef(false)
  const launchChecked = useRef(false)
  const shieldOpacity = useRef(new RNAnimated.Value(0)).current
  const open = useSharedValue(0)

  useEffect(() => {
    unlockWay().then(setWay)
  }, [])

  const unlock = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        open.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }, (finished) => {
          if (finished) runOnJS(setLocked)(false)
        })
      }
    } finally {
      busy.current = false
    }
  }, [t, open])

  // Only on launch. The effect also reruns when `unlock` changes with the language, or
  // when the database is swapped for one in another folder, and neither should ask again.
  useEffect(() => {
    if (launchChecked.current) return
    launchChecked.current = true
    isAppLockEnabled(db).then((enabled) => {
      setChecked(true)
      // The prompt waits for the launch splash to finish, not to cut it short.
      if (enabled) splashDone.then(unlock)
      else setLocked(false)
    })
  }, [db, unlock])

  useEffect(() => {
    // Only 'background': the Face ID prompt itself makes the app 'inactive'.
    let wasBackground = false
    const sub = AppState.addEventListener('change', async (state) => {
      // Hide the content before iOS snapshots it for the app switcher.
      if (state !== 'active') {
        if (isAppLockEnabledCached()) {
          shieldOpacity.stopAnimation()
          shieldOpacity.setValue(1)
          setShielded(true)
        }
      } else {
        // Dissolve the blur on the way back in.
        RNAnimated.timing(shieldOpacity, { toValue: 0, duration: 175, useNativeDriver: !isWeb }).start(({ finished }) => {
          if (finished) setShielded(false)
        })
      }
      if (state === 'background') wasBackground = true
      else if (state === 'active' && wasBackground) {
        wasBackground = false
        if (await isAppLockEnabled(db)) {
          open.value = 0
          setLocked(true)
          unlock()
        }
      }
    })
    return () => sub.remove()
  }, [db, unlock, open, shieldOpacity])

  const cover = useAnimatedStyle(() => ({ opacity: 1 - open.value }))

  if (!checked) return <View style={[styles.cover, { backgroundColor: colors.bg }]} />

  return (
    <>
      {children}
      {shielded && !locked ? (
        <RNAnimated.View pointerEvents="none" style={[styles.cover, { opacity: shieldOpacity }]}>
          {isAndroid ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
          ) : (
            <BlurView tint={scheme} intensity={100} style={StyleSheet.absoluteFill} />
          )}
        </RNAnimated.View>
      ) : null}
      {locked ? (
        <Animated.View style={[styles.cover, { backgroundColor: colors.bg }, cover]} accessibilityViewIsModal>
          <View style={styles.middle}>
            <SFIcon name="lock.fill" fallback="lock-closed" size={140} color={colors.textFaint} />
            <Text style={[styles.title, { color: colors.textMuted }]}>{t('lock.title')}</Text>
          </View>
          {/* The button of the onboarding, at the bottom as there. Solid rather than glass: the
              glass would not render under the cover's fade as it unlocks. */}
          <View
            style={[
              styles.footer,
              { paddingBottom: insets.bottom + 16, paddingLeft: Math.max(24, insets.left + 16), paddingRight: Math.max(24, insets.right + 16) },
            ]}
          >
            <Button variant="solid" icon={WAYS[way].icon} symbol={WAYS[way].symbol} label={t(WAYS[way].label)} onPress={unlock} />
          </View>
        </Animated.View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  cover: { ...FILL, zIndex: 1000 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', marginTop: 24 },
  footer: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingTop: 12 },
})
