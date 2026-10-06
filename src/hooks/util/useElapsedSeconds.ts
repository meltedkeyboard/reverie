import { useEffect, useState } from 'react'

// Whole seconds since `since`, or since active turned on, ticking while active.
export function useElapsedSeconds(active: boolean, since?: number) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = since ?? Date.now()
    const tick = () => setSeconds(Math.floor((Date.now() - start) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [active, since])
  return seconds
}
