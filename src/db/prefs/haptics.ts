import { defineFlag } from '@/db/prefs/settings'
import { setHapticsOn, setStreamHapticsOn } from '@/lib/ui/hapticsState'

// Vibration feedback across the app. On unless turned off in Settings.
const haptics = defineFlag('haptics', true, setHapticsOn)
const streamHaptics = defineFlag('stream_haptics', true, setStreamHapticsOn)

export const isHapticsEnabled = haptics.load
export const setHapticsEnabled = haptics.save

export const isStreamHapticsEnabled = streamHaptics.load
export const setStreamHapticsEnabled = streamHaptics.save
