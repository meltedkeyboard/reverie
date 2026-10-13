import { requireOptionalNativeModule } from 'expo-modules-core'

type ReverieSplashNative = {
  isAvailable: () => boolean
  isFinished: () => boolean
  dismiss: () => Promise<boolean>
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
