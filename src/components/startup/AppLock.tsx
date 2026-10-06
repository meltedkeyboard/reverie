import { BlurView } from 'expo-blur'
import * as LocalAuthentication from 'expo-local-authentication'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, AppState, StyleSheet, Text, View } from 'react-native'

import { PillButton } from '@/components/controls/PillButton'
import { Star } from '@/components/visuals/motifs/Star'
import { isAppLockEnabled, isAppLockEnabledCached } from '@/db/prefs/appLock'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { FILL, fonts, useColors, useTheme } from '@/theme'
import { isAndroid, isWeb } from '@/lib/core/platform'

// Covers the app with a lock screen until Face ID, a fingerprint or the passcode succeeds — on launch
// and after the app has been in the background. It also blurs the app in the app
// switcher while the lock is on.
export function AppLock({ children }: { children: ReactNode }) {
  const db = useDatabase()
  const colors = useColors()
  const { scheme } = useTheme()
  const { t } = useTranslation()
  const [locked, setLocked] = useState(true)
  const [shielded, setShielded] = useState(false)
  const [checked, setChecked] = useState(false)
  const busy = useRef(false)
  const launchChecked = useRef(false)
  const shieldOpacity = useRef(new Animated.Value(0)).current

  const unlock = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })
      if (result.success) setLocked(false)
    } finally {
      busy.current = false
    }
  }, [t])

  // Only on launch. The effect also reruns when `unlock` changes with the language, or
  // when the database is swapped for one in another folder, and neither should ask again.
  useEffect(() => {
    if (launchChecked.current) return
    launchChecked.current = true
    isAppLockEnabled(db).then((enabled) => {
      setChecked(true)
      if (enabled) unlock()
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
        Animated.timing(shieldOpacity, { toValue: 0, duration: 175, useNativeDriver: !isWeb }).start(({ finished }) => {
          if (finished) setShielded(false)
        })
      }
      if (state === 'background') wasBackground = true
      else if (state === 'active' && wasBackground) {
        wasBackground = false
        if (await isAppLockEnabled(db)) {
          setLocked(true)
          unlock()
        }
      }
    })
    return () => sub.remove()
  }, [db, unlock, shieldOpacity])

  if (!checked) return <View style={[styles.cover, { backgroundColor: colors.bg }]} />

  return (
    <>
      {children}
      {shielded && !locked ? (
        <Animated.View pointerEvents="none" style={[styles.cover, { opacity: shieldOpacity }]}>
          {isAndroid ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
          ) : (
            <BlurView tint={scheme} intensity={100} style={StyleSheet.absoluteFill} />
          )}
        </Animated.View>
      ) : null}
      {locked ? (
        <View style={[styles.cover, { backgroundColor: colors.bg }]}>
          <Star size={40} color={colors.accent} rotation={-14} />
          <Text style={[styles.title, { color: colors.text }]}>{t('lock.title')}</Text>
          <PillButton label={t('lock.unlock')} onPress={unlock} />
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  cover: { ...FILL, alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 1000 },
  title: { fontFamily: fonts.prose, fontWeight: '700', fontSize: 24 },
})
