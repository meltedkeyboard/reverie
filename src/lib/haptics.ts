import * as Native from 'expo-haptics'

import { isHapticsOn } from '@/lib/hapticsState'

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
