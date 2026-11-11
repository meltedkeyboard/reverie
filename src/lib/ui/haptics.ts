import * as Native from 'expo-haptics'

import {
  isHapticsOn,
  isStreamHapticsOn,
  isSuggestionHapticsOn,
  isSuggestionOverflowed,
  setSuggestionOverflowed,
} from '@/lib/ui/hapticsState'

export { isSuggestionOverflowed, setSuggestionOverflowed }

export const { ImpactFeedbackStyle, NotificationFeedbackType } = Native

export async function selectionAsync() {
  if (isHapticsOn()) await Native.selectionAsync()
}

export async function impactAsync(style?: Native.ImpactFeedbackStyle) {
  if (isHapticsOn()) await Native.impactAsync(style)
}

export async function notificationAsync(type?: Native.NotificationFeedbackType) {
  if (isHapticsOn()) await Native.notificationAsync(type)
}

let lastStreamHaptic = 0
let lastSuggestionHaptic = 0

// Fast, subtle haptic pulse for tokens streaming during generation.
export function streamTokenAsync() {
  if (!isHapticsOn() || !isStreamHapticsOn()) return
  const now = Date.now()
  if (now - lastStreamHaptic < 20) return
  lastStreamHaptic = now
  Native.selectionAsync().catch(() => {})
}

// Fast, subtle haptic pulse for tokens streaming during reply suggestion.
export function suggestionTokenAsync() {
  if (!isHapticsOn() || !isSuggestionHapticsOn() || isSuggestionOverflowed()) return
  const now = Date.now()
  if (now - lastSuggestionHaptic < 20) return
  lastSuggestionHaptic = now
  Native.selectionAsync().catch(() => {})
}

// Distinct, solid haptic pulse when reply suggestion finishes after overflowing visible area.
export function suggestionFinishAsync() {
  if (!isHapticsOn() || !isSuggestionHapticsOn()) return
  Native.impactAsync(Native.ImpactFeedbackStyle.Medium).catch(() => {})
}
