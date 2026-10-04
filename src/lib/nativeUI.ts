import { requireOptionalNativeModule } from 'expo'
import { isIOS } from '@/lib/platform'

// @expo/ui and expo-glass-effect register their native views as soon as they are
// imported, so each package is loaded only when its module is part of the build.
// Without them the screens keep their regular, non-glass look. Both are SwiftUI and
// UIKit only: ExpoUI also registers a module on Android, so the platform is checked too.


export const swiftUI =
  isIOS && requireOptionalNativeModule('ExpoUI')
    ? {
        ui: require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'),
        modifiers: require('@expo/ui/swift-ui/modifiers') as typeof import('@expo/ui/swift-ui/modifiers'),
      }
    : null

const glassModule =
  isIOS && requireOptionalNativeModule('ExpoGlassEffect')
    ? (require('expo-glass-effect') as typeof import('expo-glass-effect'))
    : null

// isGlassEffectAPIAvailable guards against early iOS 26 betas that crash on the API.
export const glassEffect =
  glassModule?.isLiquidGlassAvailable() && glassModule.isGlassEffectAPIAvailable() ? glassModule : null

export const liquidGlass = glassEffect !== null

// The iOS 26 look of the bars: no bar at all, round controls floating over the content
// with a fade under them. Android and the desktop get it with plain round surfaces in
// place of the glass; only an iOS without Liquid Glass keeps the frosted bar.
export const floatingBars = liquidGlass || !isIOS
