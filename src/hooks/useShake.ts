import { Accelerometer } from 'expo-sensors'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

// A deliberate shake: JOLTS separate peaks past THRESHOLD total g-force, all
// within WINDOW_MS. A single flick of the wrist or setting the phone down won't do it.
const THRESHOLD = 2.2
const JOLTS = 2
const WINDOW_MS = 1200
const COOLDOWN_MS = 1500

type Options = { threshold?: number; jolts?: number }

// Fires once per shake, followed by a cooldown so one shake doesn't fire it twice.
// A higher threshold and more jolts ask for a harder, longer shake.
export function useShake(onShake: () => void, enabled: boolean, { threshold = THRESHOLD, jolts: needed = JOLTS }: Options = {}) {
  const lastFired = useRef(0)

  useEffect(() => {
    // A desktop has no accelerometer, and expo-sensors has no web implementation to listen to.
    if (!enabled || Platform.OS === 'web') return
    let jolts: number[] = []
    let above = false
    Accelerometer.setUpdateInterval(50)
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const force = Math.sqrt(x * x + y * y + z * z)
      const now = Date.now()
      // Count only the moment a peak crosses the threshold, so one long jolt is one jolt.
      const crossed = force > threshold && !above
      above = force > threshold
      if (!crossed || now - lastFired.current < COOLDOWN_MS) return
      jolts = [...jolts.filter((t) => now - t < WINDOW_MS), now]
      if (jolts.length >= needed) {
        jolts = []
        lastFired.current = now
        onShake()
      }
    })
    return () => sub.remove()
  }, [enabled, onShake, threshold, needed])
}
