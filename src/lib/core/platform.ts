import { Platform } from 'react-native'

export const isIOS = Platform.OS === 'ios'
export const isAndroid = Platform.OS === 'android'
export const isWeb = Platform.OS === 'web'
// The look of an app on a computer: the web build, in the Electron window or in a browser.
export const isDesktop = isWeb
// The web build in the Electron window, which has no frame: the page draws the title bar,
// and the main process passes on what the window's menu would take (Ctrl+W).
export const isElectron = isWeb && typeof globalThis !== 'undefined' && 'reverieDesktop' in globalThis

export const FONTS = {
  // Android has no Georgia; its serif is the closest system face.
  prose: isAndroid ? 'serif' : 'Georgia',
  mono: isAndroid ? 'monospace' : 'Menlo',
} as const
