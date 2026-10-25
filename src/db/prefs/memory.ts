import { defineFlag } from '@/db/prefs/settings'

// Long memory: what falls out of a chat's context window is summed up and kept in the
// system prompt. Off unless turned on in Settings, since every summary is a request of its
// own. The value is also held in memory for the request builders, which read it in passing.
let enabled = false

const longMemory = defineFlag('long_memory', false, (on) => {
  enabled = on
})

export const loadLongMemory = longMemory.load
export const saveLongMemory = longMemory.save

export function longMemoryEnabled() {
  return enabled
}
