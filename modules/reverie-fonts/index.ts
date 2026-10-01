import { requireOptionalNativeModule } from 'expo'

type FontsModule = {
  families(): string[]
}

// Missing in Expo Go.
const fonts = requireOptionalNativeModule<FontsModule>('ReverieFonts')

// Every font family installed on the device, by name, in alphabetical order. Empty
// where the module is missing.
export function installedFontFamilies(): string[] {
  return fonts?.families() ?? []
}
