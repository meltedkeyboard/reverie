import { defineFlag } from '@/db/settings'

// Last known value, readable synchronously: the app switcher snapshot is taken the moment
// the app goes inactive, too soon to wait for a database read.
let cached = false

// Ask for Face ID whenever the app is opened. Off unless turned on in Settings.
const appLock = defineFlag('app_lock', false, (on) => {
  cached = on
})

export const isAppLockEnabledCached = () => cached
export const isAppLockEnabled = appLock.load
export const setAppLockEnabled = appLock.save
