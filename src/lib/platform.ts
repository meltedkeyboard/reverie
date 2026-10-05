import { Platform } from 'react-native'

export const isIOS = Platform.OS === 'ios'
export const isAndroid = Platform.OS === 'android'
export const isWeb = Platform.OS === 'web'
// The web build running in the Electron window: an app on a computer, not a page in a browser.
export const isDesktop = isWeb && typeof globalThis !== 'undefined' && 'reverieDesktop' in globalThis

export const FONTS = {
  // Android has no Georgia; its serif is the closest system face.
  prose: isAndroid ? 'serif' : 'Georgia',
  mono: isAndroid ? 'monospace' : 'Menlo',
} as const
