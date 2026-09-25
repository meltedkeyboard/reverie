import * as LocalAuthentication from 'expo-local-authentication'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState, Platform, StyleSheet, Text, View } from 'react-native'

import { ShardButton } from '@/components/motifs/ShardButton'
import { Star } from '@/components/motifs/Star'
import { isAppLockEnabled } from '@/db/appLock'
import { useTranslation } from '@/i18n'
import { fonts, useColors } from '@/theme'

// Covers the app with a lock screen until Face ID (or the passcode) succeeds — on launch
// and after the app has been in the background. Native only.
export function AppLock({ children }: { children: ReactNode }) {
  const db = useSQLiteContext()
  const colors = useColors()
  const { t } = useTranslation()
  const [locked, setLocked] = useState(Platform.OS !== 'web')
  const [checked, setChecked] = useState(Platform.OS === 'web')
  const busy = useRef(false)

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

  useEffect(() => {
    if (Platform.OS === 'web') return
    isAppLockEnabled(db).then((enabled) => {
      setChecked(true)
      if (enabled) unlock()
      else setLocked(false)
    })
  }, [db, unlock])

  useEffect(() => {
    if (Platform.OS === 'web') return
    // Only 'background': the Face ID prompt itself makes the app 'inactive'.
    let wasBackground = false
    const sub = AppState.addEventListener('change', async (state) => {
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
  }, [db, unlock])

  if (!checked) return <View style={[styles.cover, { backgroundColor: colors.bg }]} />

  return (
    <>
      {children}
      {locked ? (
        <View style={[styles.cover, { backgroundColor: colors.bg }]}>
          <Star size={40} color={colors.accent} rotation={-14} />
          <Text style={[styles.title, { color: colors.text }]}>{t('lock.title')}</Text>
          <ShardButton label={t('lock.unlock')} onPress={unlock} />
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 1000 },
  title: { fontFamily: fonts.prose, fontWeight: '700', fontSize: 24 },
})
