import * as Native from 'expo-haptics'

import { isHapticsOn, isStreamHapticsOn } from '@/lib/ui/hapticsState'

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

// Fast, subtle haptic pulse for tokens streaming during generation.
export function streamTokenAsync() {
  if (!isHapticsOn() || !isStreamHapticsOn()) return
  const now = Date.now()
  if (now - lastStreamHaptic < 20) return
  lastStreamHaptic = now
  Native.selectionAsync().catch(() => {})
}
