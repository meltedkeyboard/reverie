import { requireOptionalNativeModule } from 'expo'

type IconsModule = {
  supportsAlternateIcons: boolean
  getAppIconName(): string | null
  setAlternateAppIcon(name: string | null): Promise<string | null>
}

// The alternate icons are baked into the native build by the expo-alternate-app-icons
// plugin (see app.json), so Expo Go has no such module. The package's own JS entry throws
// on import without it, hence the module is reached directly.
const native = requireOptionalNativeModule<IconsModule>('ExpoAlternateAppIcons')

// A development build without the module (Expo Go, the web) still shows the picker, so its
// look can be checked: the choice is only kept in memory there and the icon stays as it is.
export const alternateIconsAvailable = native?.supportsAlternateIcons ?? __DEV__
let previewChoice: string | null = null

// The names are the ones given to the plugin in app.json, drawn in assets/brand/alt and
// rendered by scripts/build-icons.mjs, previews included. The standard icon is not here:
// it is the app's own, in a light and a dark look. An icon that is pale or dark all over
// comes in both looks too, and so does its preview: { light, dark }.
export const APP_ICONS = [
  { name: 'CoralSunrise', preview: require('../../../assets/images/alt/icon-03-sunrise-preview.png') },
  { name: 'PaperLight', preview: { light: require('../../../assets/images/alt/icon-04-paper-preview.png'), dark: require('../../../assets/images/alt/icon-04-paper-dark-preview.png') } },
  { name: 'VioletSun', preview: require('../../../assets/images/alt/icon-05-violet-sun-preview.png') },
  { name: 'Metal', preview: require('../../../assets/images/alt/icon-08-metal-preview.png') },
] as const

// The picture of an icon as the Home Screen shows it in the given look.
export function previewFor(preview: number | { light: number; dark: number }, scheme: 'light' | 'dark') {
  return typeof preview === 'number' ? preview : preview[scheme]
}

export const DEFAULT_ICON_PREVIEW = {
  light: require('../../../assets/images/alt/default-light-preview.png'),
  dark: require('../../../assets/images/alt/default-dark-preview.png'),
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
