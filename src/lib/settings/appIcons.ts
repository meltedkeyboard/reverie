import { requireOptionalNativeModule } from 'expo'

import { isAndroid } from '@/lib/core/platform'

type IconsModule = {
  supportsAlternateIcons: boolean
  getAppIconName(): string | null
  setAlternateAppIcon(name: string | null): Promise<string | null>
}

type Look = 'light' | 'dark'

export type AppIcon = {
  name: string | null
  preview: number | { light: number; dark: number }
  android?: Look
  glow: string
}

// The alternate icons are baked into the native build by the expo-alternate-app-icons
// plugin (see app.json), so Expo Go has no such module. The package's own JS entry throws
// on import without it, hence the module is reached directly.
const native = requireOptionalNativeModule<IconsModule>('ExpoAlternateAppIcons')

// A development build without the module (Expo Go, the web) still shows the picker, so its
// look can be checked: the choice is only kept in memory there and the icon stays as it is.
export const alternateIconsAvailable = native?.supportsAlternateIcons ?? __DEV__
let previewChoice: string | null = null

// What the picker offers: the standard icon first (null, the app's own from app.json), then
// the alternates under the names given to the plugin in app.json, drawn in assets/brand/alt
// and rendered by tools/build-icons.mjs, previews included. An icon that is pale or dark all
// over comes in both looks of the Home Screen, and so does its preview: { light, dark }. An
// Android launcher has no dark icons and shows the one look named by android. glow is the
// color the picker lights the page with behind the icon, the one the icon reads as.
export const APP_ICONS: readonly AppIcon[] = [
  {
    name: null,
    preview: { light: require('../../../assets/images/alt/default-light-preview.png'), dark: require('../../../assets/images/alt/default-dark-preview.png') },
    android: 'dark',
    glow: '#5F55E0',
  },
  { name: 'CoralSunrise', preview: require('../../../assets/images/alt/icon-03-sunrise-preview.png'), glow: '#FA6E4F' },
  {
    name: 'PaperLight',
    preview: { light: require('../../../assets/images/alt/icon-04-paper-preview.png'), dark: require('../../../assets/images/alt/icon-04-paper-dark-preview.png') },
    android: 'light',
    glow: '#C9B490',
  },
  { name: 'VioletSun', preview: require('../../../assets/images/alt/icon-05-violet-sun-preview.png'), glow: '#5F55E0' },
  { name: 'Metal', preview: require('../../../assets/images/alt/icon-08-metal-preview.png'), glow: '#138CF8' },
]

// The picture of an icon as the Home Screen shows it in the given look.
export function previewFor(icon: AppIcon, scheme: Look) {
  if (typeof icon.preview === 'number') return icon.preview
  return icon.preview[isAndroid ? (icon.android ?? 'light') : scheme]
}

// Whether the icon on the Home Screen changes with its light and dark look.
export function followsLook(icon: AppIcon) {
  return !isAndroid && typeof icon.preview !== 'number'
}

// null is the standard icon.
export function currentAppIcon() {
  return native ? native.getAppIconName() : previewChoice
}

export function setAppIcon(name: string | null) {
  if (!native) {
    if (!__DEV__) throw new Error('Alternate icons are not available in this build')
    previewChoice = name
    return Promise.resolve(name)
  }
  return native.setAlternateAppIcon(name)
}
