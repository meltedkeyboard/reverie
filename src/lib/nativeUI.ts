import { requireOptionalNativeModule } from 'expo'
import { Platform } from 'react-native'

// @expo/ui and expo-glass-effect register their native views as soon as they are
// imported, so each package is loaded only when its module is part of the build.
// Without them the screens keep their regular, non-glass look. Both are SwiftUI and
// UIKit only: ExpoUI also registers a module on Android, so the platform is checked too.

const ios = Platform.OS === 'ios'

export const swiftUI =
  ios && requireOptionalNativeModule('ExpoUI')
    ? {
        ui: require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'),
        modifiers: require('@expo/ui/swift-ui/modifiers') as typeof import('@expo/ui/swift-ui/modifiers'),
      }
    : null

const glassModule =
  ios && requireOptionalNativeModule('ExpoGlassEffect')
    ? (require('expo-glass-effect') as typeof import('expo-glass-effect'))
    : null

// isGlassEffectAPIAvailable guards against early iOS 26 betas that crash on the API.
export const glassEffect =
  glassModule?.isLiquidGlassAvailable() && glassModule.isGlassEffectAPIAvailable() ? glassModule : null

export const liquidGlass = glassEffect !== null
