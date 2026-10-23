import { useRecyclingState } from '@shopify/flash-list'
import { useEffect } from 'react'

// A message row first shows as plain Text with plain glyphs, which look the same and cost
// little to lay out, and later takes on the selectable UITextView, the native menu and the
// animated symbols. Those are what made a chat slow to come up, so they come one row a
// frame, never under the drawer's spring. While the list scrolls they go on more slowly:
// the list lays out rows well past the screen, and upgraded there as they come, they are
// ready before the reader gets to them, however long the scroll.

type Job = () => void

// While the list scrolls, a row every this many frames, to leave the scroll its frames.
const MOVING_EVERY = 4

const queue: Job[] = []
const holds = new Set<string>()
const slows = new Set<string>()
let frame = 0
let skipped = 0

const pump = () => {
  if (frame || holds.size || !queue.length) return
  frame = requestAnimationFrame(() => {
    frame = 0
    if (holds.size) return
    if (slows.size && ++skipped < MOVING_EVERY) return pump()
    skipped = 0
    queue.shift()?.()
    pump()
  })
}

// Holds the upgrades off while something moves, `reason` naming who holds them.
export function holdHydration(reason: string, held: boolean) {
  if (held) holds.add(reason)
  else if (holds.delete(reason)) pump()
}

// Slows the upgrades down while a list scrolls, `reason` naming the list.
export function slowHydration(reason: string, slow: boolean) {
  if (slow) slows.add(reason)
  else slows.delete(reason)
}

// How a row comes up: rich at once ('off', where nothing is switched in place), or plain
// and upgraded in its turn ('go'), or plain and left so for now ('wait': laid out behind
// the chat on screen, where an upgrade would only cost the frames of the switch to it).
export type Hydration = 'off' | 'wait' | 'go'

// Whether the row of `key` has been upgraded. A recycled cell showing another message goes
// back to plain until its turn comes again.
export function useHydrated(key: string, mode: Hydration): boolean {
  const [rich, setRich] = useRecyclingState(mode === 'off', [key])
  useEffect(() => {
    if (rich || mode !== 'go') return
    const job = () => setRich(true)
    queue.push(job)
    pump()
    return () => {
      const at = queue.indexOf(job)
      if (at !== -1) queue.splice(at, 1)
    }
  }, [rich, mode, setRich])
  return rich || mode === 'off'
}
