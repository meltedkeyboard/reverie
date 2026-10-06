import { defineFlag } from '@/db/prefs/settings'

const onboarding = defineFlag('onboarding_completed', false)

export const isOnboardingComplete = onboarding.load
export const setOnboardingComplete = onboarding.save
