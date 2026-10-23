import type { BackgroundEffect, BackgroundTone } from '@/db/characters'
import type { Rgb } from '@/lib/images/pictureColor'
import { paletteOf, type Scheme, type ThemeName } from '@/theme'

// How far each effect dims at full intensity, and the fixed dim of a picture shown blurred
// whatever its effect (under the drawer's list and the menus). ChatBackground draws by these.
export const MAX_DIM = 0.9
export const BLURRED_DIM = 0.38

type Softened = {
  // The picture's average color; null when it could not be measured.
  color: Rgb | null
  effect: BackgroundEffect
  intensity: number
  tone: BackgroundTone
  // Shown fully blurred under a fixed dim, as under the drawer's list.
  blurred?: boolean
}

// The scheme a chat is shown in over its picture: the one chosen, else the one whose text
// stands out more against the picture as the chat lays it out, its average color under the
// dim. A dim in the theme's color follows the scheme picked, so the theme's own one is kept
// whenever it reads, and only a picture the dim cannot carry turns it over. Unmeasured, a
// light or dark dim says which; anything else keeps the theme's.
export function schemeOver({ color, effect, intensity, tone, blurred = false }: Softened, theme: ThemeName, own: Scheme): Scheme {
  if (tone !== 'auto') return tone
  if (!color) return effect === 'dim-light' ? 'light' : effect === 'dim-dark' ? 'dark' : own
  const amount = blurred ? BLURRED_DIM : effect === 'blur' ? 0 : intensity * MAX_DIM
  const dimOf = (scheme: Scheme) =>
    hexRgb(paletteOf(theme, effect === 'dim-light' ? 'light' : effect === 'dim-dark' ? 'dark' : scheme).bg)
  const other: Scheme = own === 'light' ? 'dark' : 'light'
  for (const scheme of [own, other]) {
    if (readsAs(mix(color, dimOf(scheme), amount), theme) === scheme) return scheme
  }
  return own
}

// The scheme whose text has more contrast against a color.
function readsAs(color: Rgb, theme: ThemeName): Scheme {
  const back = luminance(color)
  const contrast = (scheme: Scheme) => {
    const text = luminance(hexRgb(paletteOf(theme, scheme).text))
    return (Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05)
  }
  return contrast('light') >= contrast('dark') ? 'light' : 'dark'
}

// Laid over as the screen composites it, in sRGB.
const mix = (base: Rgb, over: Rgb, amount: number): Rgb => [0, 1, 2].map((i) => base[i] + (over[i] - base[i]) * amount) as Rgb

const hexRgb = (hex: string): Rgb => {
  const value = parseInt(hex.slice(1, 7), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

// Relative luminance, as WCAG defines it.
function luminance([r, g, b]: Rgb) {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}
