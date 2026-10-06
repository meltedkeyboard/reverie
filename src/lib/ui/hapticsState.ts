// Whether haptic feedback is on. Kept in memory so every call site can check it
// synchronously; the db layer loads it at startup and Settings writes it.
let enabled = true

export const isHapticsOn = () => enabled
export const setHapticsOn = (on: boolean) => {
  enabled = on
}
