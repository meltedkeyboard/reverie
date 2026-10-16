import { requireOptionalNativeModule } from 'expo'
import { isIOS } from '@/lib/core/platform'

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

// Disabled for flat minimal design
export const glassEffect: (typeof import('expo-glass-effect')) | null = null

export const liquidGlass = false

// Flat solid header bars and toolbars instead of floating liquid glass
export const floatingBars = false

