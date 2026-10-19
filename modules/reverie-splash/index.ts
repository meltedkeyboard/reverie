import { requireOptionalNativeModule } from 'expo-modules-core'

type ReverieSplashNative = {
  isAvailable: () => boolean
  isFinished: () => boolean
  dismiss: () => Promise<boolean>
  displayCornerRadius: () => number
}

const ReverieSplash = requireOptionalNativeModule<ReverieSplashNative>('ReverieSplash')

export function isNativeSplashAvailable(): boolean {
  return Boolean(ReverieSplash?.isAvailable?.())
}

export function isNativeSplashFinished(): boolean {
  return Boolean(ReverieSplash?.isFinished?.())
}

export async function dismissNativeSplash(): Promise<void> {
  if (ReverieSplash?.dismiss) {
    await ReverieSplash.dismiss()
  }
}

// 0 where the module is missing (Expo Go, Android, the web) or the screen has square corners.
export function displayCornerRadius(): number {
  return ReverieSplash?.displayCornerRadius?.() ?? 0
}
