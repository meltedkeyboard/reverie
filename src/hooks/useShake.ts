import { Accelerometer } from 'expo-sensors'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

const THRESHOLD = 2.2
const COOLDOWN_MS = 1500

// Fires once per shake: a jolt past THRESHOLD total g-force, followed by a cooldown so
// a single toss doesn't fire the callback several times in a row.
// No-op on web: expo-sensors' Accelerometer isn't available there.
export function useShake(onShake: () => void, enabled: boolean) {
  const lastFired = useRef(0)

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return
    Accelerometer.setUpdateInterval(100)
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const force = Math.sqrt(x * x + y * y + z * z)
      const now = Date.now()
      if (force > THRESHOLD && now - lastFired.current > COOLDOWN_MS) {
        lastFired.current = now
        onShake()
      }
    })
    return () => sub.remove()
  }, [enabled, onShake])
}
