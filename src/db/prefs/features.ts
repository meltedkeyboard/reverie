import { defineFlag } from '@/db/prefs/settings'
import { setFeatureOn } from '@/lib/settings/features'

// The user's personas and a chat's direction, each on unless switched off in Settings.
const personas = defineFlag('personas_enabled', true, (on) => setFeatureOn('personas', on))
const direction = defineFlag('direction_enabled', true, (on) => setFeatureOn('direction', on))

export const isPersonasEnabled = personas.load
export const setPersonasEnabled = personas.save
export const isDirectionEnabled = direction.load
export const setDirectionEnabled = direction.save
