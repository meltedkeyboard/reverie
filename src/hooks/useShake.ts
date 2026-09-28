import { Accelerometer } from 'expo-sensors'
import { useEffect, useRef } from 'react'

// A deliberate shake: JOLTS separate peaks past THRESHOLD total g-force, all
// within WINDOW_MS. A single flick of the wrist or setting the phone down won't do it.
const THRESHOLD = 2.2
const JOLTS = 2
const WINDOW_MS = 1200
const COOLDOWN_MS = 1500

// Fires once per shake, followed by a cooldown so one shake doesn't fire it twice.
export function useShake(onShake: () => void, enabled: boolean) {
  const lastFired = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let jolts: number[] = []
    let above = false
    Accelerometer.setUpdateInterval(50)
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const force = Math.sqrt(x * x + y * y + z * z)
      const now = Date.now()
      // Count only the moment a peak crosses the threshold, so one long jolt is one jolt.
      const crossed = force > THRESHOLD && !above
      above = force > THRESHOLD
      if (!crossed || now - lastFired.current < COOLDOWN_MS) return
      jolts = [...jolts.filter((t) => now - t < WINDOW_MS), now]
      if (jolts.length >= JOLTS) {
        jolts = []
        lastFired.current = now
        onShake()
      }
    })
    return () => sub.remove()
  }, [enabled, onShake])
}
