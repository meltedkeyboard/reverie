import { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics'

import { isHapticsOn } from '@/lib/hapticsState'

export { ImpactFeedbackStyle, NotificationFeedbackType }

// expo-haptics does nothing in a browser. Android browsers have the Vibration API;
// Safari on iOS doesn't, but toggling a native switch input gives a system tap, so
// each tick of a pattern is played that way there. Desktops have neither.
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

function tick() {
  const label = document.createElement('label')
  label.ariaHidden = 'true'
  label.style.display = 'none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  label.appendChild(input)
  document.head.appendChild(label)
  label.click()
  label.remove()
}

// A pattern alternates vibration and pause in ms, like navigator.vibrate takes it.
function play(pattern: number[]) {
  if (typeof document === 'undefined' || !isHapticsOn()) return
  try {
    if (canVibrate) {
      navigator.vibrate(pattern)
      return
    }
    let at = 0
    pattern.forEach((ms, i) => {
      if (i % 2 === 0) {
        if (at === 0) tick()
        else setTimeout(tick, at)
      }
      at += ms
    })
  } catch {
    // Feedback is a nicety, never worth an error.
  }
}

const IMPACT: Record<ImpactFeedbackStyle, number> = {
  [ImpactFeedbackStyle.Soft]: 6,
  [ImpactFeedbackStyle.Light]: 10,
  [ImpactFeedbackStyle.Rigid]: 12,
  [ImpactFeedbackStyle.Medium]: 16,
  [ImpactFeedbackStyle.Heavy]: 24,
}

const NOTIFICATION: Record<NotificationFeedbackType, number[]> = {
  [NotificationFeedbackType.Success]: [10, 70, 14],
  [NotificationFeedbackType.Warning]: [14, 90, 10],
  [NotificationFeedbackType.Error]: [14, 50, 14, 50, 14],
}

export async function selectionAsync() {
  play([6])
}

export async function impactAsync(style: ImpactFeedbackStyle = ImpactFeedbackStyle.Medium) {
  play([IMPACT[style]])
}

export async function notificationAsync(type: NotificationFeedbackType = NotificationFeedbackType.Success) {
  play(NOTIFICATION[type])
}
