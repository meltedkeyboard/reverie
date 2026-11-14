import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import type { Rgb } from '@/lib/images/pictureColor'
import { useTheme, type Scheme } from '@/theme'

type Props = {
  // The profile's color, from profileTint; nothing is drawn until it is known.
  color: Rgb | null | undefined
  height: number
  scrollY: SharedValue<number>
  // 0 round, 1 spread out: the open photo covers the top, and the glow gives way to it.
  spread: SharedValue<number>
}

// How strongly the color starts at the top of the screen. A dark page carries more of it
// before it looks muddy, a light one less before the header's text stops reading.
const STRENGTH: Record<Scheme, number> = { dark: 0.9, light: 0.65 }

// A wash of the avatar's color down a character's profile, strong at the top and fading
// into the page about a screen down, as in a Telegram profile. Laid behind the scroll view
// and moved up with the page, so it scrolls away under the header; a pull down leaves it at
// the top, with no gap above it. It holds no glass, so fading it as the photo spreads is safe.
export function ProfileGlow({ color, height, scrollY, spread }: Props) {
  const { scheme } = useTheme()
  const style = useAnimatedStyle(() => ({
    opacity: 1 - spread.value,
    transform: [{ translateY: -Math.max(0, scrollY.value) }],
  }))
  if (!color) return null
  const [r, g, b] = color.map(Math.round)
  const alpha = STRENGTH[scheme]
  const at = (share: number) => `rgba(${r}, ${g}, ${b}, ${alpha * share})`
  return (
    <Animated.View style={[styles.glow, { height }, style]} pointerEvents="none">
      {/* Every stop in the same color, so the tail fades out instead of greying on the way. */}
      <LinearGradient colors={[at(1), at(0.7), at(0.35), at(0)]} locations={[0, 0.3, 0.65, 1]} style={StyleSheet.absoluteFill} />
    </Animated.View>
  )
}

// The color the top of the glow comes out as over the page, as "r, g, b": what the fade
// under the header takes on the profile, so the header keeps the color as the page scrolls
// and the glow goes up under it, instead of turning back to the page's grey.
export function glowTop(color: Rgb, bgRgb: string, scheme: Scheme) {
  const bg = bgRgb.split(',').map(Number)
  return bg.map((c, i) => Math.round(c + (color[i] - c) * STRENGTH[scheme])).join(', ')
}

// A color written as #rrggbb, as the initials' tints are, for a profile without a photo.
export function hexRgb(hex: string): Rgb {
  const value = parseInt(hex.slice(1, 7), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

// The color a profile is washed in: the avatar's average, made more vivid. An average comes
// out greyish, a photo's colors cancelling out, and washed over the page as it is it read
// as a dirty shade rather than the character's color. The hue is kept, the saturation
// raised and the lightness kept to the middle.
// A softer tint for chrome UI (tab bar, buttons, composer): keeps natural saturation and balanced lightness.
export function wallpaperTint(average: Rgb): Rgb {
  const [h, s, l] = hsl(average)
  return rgb(h, Math.min(0.6, Math.max(0.2, s)), Math.min(0.52, Math.max(0.36, l)))
}

export function profileTint(average: Rgb): Rgb {
  const [h, s, l] = hsl(average)
  return rgb(h, Math.min(1, s * 1.6 + 0.15), Math.min(0.62, Math.max(0.38, l)))
}

// Analogous shades of the profile's glow tint for a room's cast members in the profile list,
// keeping them within the gradient's family while making each member distinct and readable.
const CAST_HUE_OFFSETS = [0, 0.06, -0.06, 0.12, -0.12, 0.18, -0.18, 0.24]

export function castShades(base: Rgb, scheme: Scheme, count = 6): string[] {
  const [h, s] = hsl(base)
  const targetL = scheme === 'dark' ? 0.70 : 0.40
  const targetS = Math.max(0.7, Math.min(0.92, s * 1.2))
  return Array.from({ length: count }, (_, i) => {
    const offset = CAST_HUE_OFFSETS[i % CAST_HUE_OFFSETS.length]
    const shiftedH = ((h + offset) % 1 + 1) % 1
    const shiftedL = targetL + (i % 2 === 0 ? 0.02 : -0.02)
    const [r, g, b] = rgb(shiftedH, targetS, shiftedL).map((c) => Math.max(0, Math.min(255, Math.round(c))))
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  })
}

function hsl([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
  return [h / 6, s, l]
}

function rgb(h: number, s: number, l: number): Rgb {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255]
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0 },
})
