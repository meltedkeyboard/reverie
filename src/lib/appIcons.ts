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

export const alternateIconsAvailable = native?.supportsAlternateIcons ?? false

// The names are the ones given to the plugin in app.json, drawn in assets/brand/alt and
// rendered by scripts/build-icons.mjs, previews included. The standard icon is not here:
// it is the app's own, in a light and a dark look.
export const APP_ICONS = [
  { name: 'VioletGradient', preview: require('../../assets/images/alt/icon-02-violet-gradient-preview.png') },
  { name: 'CoralSunrise', preview: require('../../assets/images/alt/icon-03-coral-sunrise-preview.png') },
  { name: 'PaperLight', preview: require('../../assets/images/alt/icon-04-paper-light-preview.png') },
  { name: 'VioletSun', preview: require('../../assets/images/alt/icon-05-violet-solid-sun-preview.png') },
  { name: 'Outline', preview: require('../../assets/images/alt/icon-06-outline-preview.png') },
  { name: 'NeonGlow', preview: require('../../assets/images/alt/icon-07-neon-glow-preview.png') },
  { name: 'Metal', preview: require('../../assets/images/alt/icon-08-metal-preview.png') },
  { name: 'RetroSticker', preview: require('../../assets/images/alt/icon-09-retro-sticker-preview.png') },
  { name: 'ToneOnTone', preview: require('../../assets/images/alt/icon-10-tone-on-tone-preview.png') },
] as const

export const DEFAULT_ICON_PREVIEW = {
  light: require('../../assets/images/alt/default-light-preview.png'),
  dark: require('../../assets/images/alt/default-dark-preview.png'),
}

// null is the standard icon.
export function currentAppIcon() {
  return native?.getAppIconName() ?? null
}

export function setAppIcon(name: string | null) {
  if (!native) throw new Error('Alternate icons are not available in this build')
  return native.setAlternateAppIcon(name)
}
