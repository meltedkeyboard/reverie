import { isWeb } from '@/lib/platform'

// Where the pointer last went down, so a menu opened by a click can appear at that spot.
// Only the web has a pointer worth following; a touch screen opens sheets from the bottom.
let last: { x: number; y: number } | null = null

if (isWeb && typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      last = { x: e.clientX, y: e.clientY }
    },
    true
  )
}

export function lastPointer() {
  return last
}
