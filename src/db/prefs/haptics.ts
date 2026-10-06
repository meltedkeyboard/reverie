import { defineFlag } from '@/db/prefs/settings'
import { setHapticsOn } from '@/lib/ui/hapticsState'

// Vibration feedback across the app. On unless turned off in Settings.
const haptics = defineFlag('haptics', true, setHapticsOn)

export const isHapticsEnabled = haptics.load
export const setHapticsEnabled = haptics.save
