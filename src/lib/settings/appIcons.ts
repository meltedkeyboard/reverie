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
// the alternates under the names given to the plugin in app.json. The standard set features
// the default color palettes, while the classic set preserves the original brand icons.
export const STANDARD_ICONS: readonly AppIcon[] = [
  {
    name: null,
    preview: require('../../../assets/images/alt/icon-azure-blue-preview.png'),
    glow: '#1472E6',
  },
  {
    name: 'VioletDream',
    preview: require('../../../assets/images/alt/icon-violet-dream-preview.png'),
    glow: '#5046CF',
  },
  {
    name: 'MidnightObsidian',
    preview: require('../../../assets/images/alt/icon-midnight-obsidian-preview.png'),
    glow: '#0C0E19',
  },
  {
    name: 'CoralStar',
    preview: require('../../../assets/images/alt/icon-coral-star-preview.png'),
    glow: '#DF4958',
  },
  {
    name: 'WarmEspresso',
    preview: require('../../../assets/images/alt/icon-warm-espresso-preview.png'),
    glow: '#191512',
  },
  {
    name: 'CyberCyan',
    preview: require('../../../assets/images/alt/icon-cyber-cyan-preview.png'),
    glow: '#187590',
  },
  {
    name: 'SunriseOrange',
    preview: require('../../../assets/images/alt/icon-sunrise-orange-preview.png'),
    glow: '#ED5734',
  },
]

export const CLASSIC_ICONS: readonly AppIcon[] = [
  {
    name: 'ClassicDefault',
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

export const APP_ICONS: readonly AppIcon[] = [...STANDARD_ICONS, ...CLASSIC_ICONS]

export type AppIconSection = {
  key: 'standard' | 'classic'
  icons: readonly AppIcon[]
}

export const APP_ICON_SECTIONS: readonly AppIconSection[] = [
  { key: 'standard', icons: STANDARD_ICONS },
  { key: 'classic', icons: CLASSIC_ICONS },
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
