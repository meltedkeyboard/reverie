import Constants from 'expo-constants'
import pkg from '../../../package.json'

// The app version shown to the user. Kept equal to "version" in app.json, which is what
// the store build reports.
export const APP_VERSION = pkg.version

// The count of commits the app was built from, worked out by app.config.js on every build;
// absent when it was built without git.
export const APP_BUILD: number | undefined = Constants.expoConfig?.extra?.build

// Settings > About
export const APP_VERSION_BUILD = APP_BUILD ? `${APP_VERSION} (${APP_BUILD})` : APP_VERSION

// Settings > About: the copyright under the version, and where the star goes.
export const APP_COPYRIGHT = '© 2026 meltedkeyboard'
export const REPO_URL = 'https://github.com/meltedkeyboard/reverie'
// Under the star: a new issue, to tell of a bug.
export const ISSUES_URL = `${REPO_URL}/issues/new`
