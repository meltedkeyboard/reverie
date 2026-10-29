import { useSyncExternalStore } from 'react'

// Parts of a chat the user can switch off in Settings, whole: off, the menu leaves out their
// rows and the requests leave out what they would add, while what was set in them is kept
// for when they are switched on again. Kept in memory so the request builders can check them
// synchronously; the db layer loads them at startup and Settings writes them.
export type Feature = 'personas' | 'direction'

const on: Record<Feature, boolean> = { personas: true, direction: true }
const listeners = new Set<() => void>()

export const isFeatureOn = (feature: Feature) => on[feature]

export function setFeatureOn(feature: Feature, value: boolean) {
  if (on[feature] === value) return
  on[feature] = value
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useFeature(feature: Feature) {
  return useSyncExternalStore(subscribe, () => on[feature])
}
