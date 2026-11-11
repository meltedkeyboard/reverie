// Whether haptic feedback is on. Kept in memory so every call site can check it
// synchronously; the db layer loads it at startup and Settings writes it.
let enabled = true
let streamHapticsEnabled = true
let suggestionHapticsEnabled = true

export const isHapticsOn = () => enabled
export const setHapticsOn = (on: boolean) => {
  enabled = on
}

export const isStreamHapticsOn = () => streamHapticsEnabled
export const setStreamHapticsOn = (on: boolean) => {
  streamHapticsEnabled = on
}

export const isSuggestionHapticsOn = () => suggestionHapticsEnabled
export const setSuggestionHapticsOn = (on: boolean) => {
  suggestionHapticsEnabled = on
}
