import { useDeferredValue, useEffect, useMemo } from 'react'
import { Appearance, useColorScheme } from 'react-native'
import { applyDesktopChrome } from '@/lib/ui/desktopChrome'
import { FONTS, isDesktop, isWeb } from '@/lib/core/platform'
import { createRequiredContext } from '@/lib/core/requiredContext'

export type Scheme = 'light' | 'dark'
// A theme is a pair of palettes, a light and a dark one; the mode picks which is shown.
export const THEMES = ['default', 'warm', 'neutral', 'oled'] as const
export type ThemeName = (typeof THEMES)[number]
export type ThemeMode = Scheme | 'system'

export type Colors = {
  bg: string
  // The bg color as "r, g, b" components, for building translucent overlays
  // (blur/glass fallback tints, edge fades) that must fade to the same hue as the
  // screen behind them without a separate rgba constant per use site.
  bgRgb: string
  surface: string
  surfaceRaised: string
  bubble: string
  border: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  accentSoft: string
  accentBorder: string
  danger: string
  dangerSoft: string
  dangerBorder: string
  success: string
  // A stronger hairline than `border`, for outlines that need to read as a shape's
  // edge (shard chips/buttons) rather than a faint divider.
  borderStrong: string
  // Color for decorative background patterns (stars, dots, rings) against bg.
  pattern: string
  // Name colors for the characters of a room, by their place in it; readable on bg.
  cast: string[]
}

const darkColors: Colors = {
  bg: '#0F0F12',
  bgRgb: '15, 15, 18',
  surface: '#18181D',
  surfaceRaised: '#202027',
  bubble: '#2A2A32',
  border: 'rgba(255, 255, 255, 0.08)',
  text: '#F2F2F5',
  textMuted: 'rgba(255, 255, 255, 0.65)',
  textFaint: 'rgba(255, 255, 255, 0.4)',
  accent: '#756DE9',
  accentSoft: 'rgba(117, 109, 233, 0.16)',
  accentBorder: 'rgba(117, 109, 233, 0.35)',
  danger: '#F0616D',
  dangerSoft: 'rgba(240, 97, 109, 0.1)',
  dangerBorder: 'rgba(240, 97, 109, 0.3)',
  success: '#5FCB8B',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  pattern: '#0A0A0D',
  cast: ['#F0A35E', '#6CC4E8', '#E779B2', '#7FD17F', '#B99BFF', '#F2D46B'],
}

// True pure black for OLED screens: zero backlight on black pixels, neutral greys for surfaces.
const blackColors: Colors = {
  ...darkColors,
  bg: '#000000',
  bgRgb: '0, 0, 0',
  surface: '#121212',
  surfaceRaised: '#1C1C1C',
  bubble: '#222222',
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  pattern: '#040404',
  text: '#F5F5F5',
  textMuted: 'rgba(255, 255, 255, 0.65)',
  textFaint: 'rgba(255, 255, 255, 0.4)',
}

// Clean neutral grey with no violet or blue undertones: perfectly balanced RGB components.
const greyColors: Colors = {
  ...darkColors,
  bg: '#141414',
  bgRgb: '20, 20, 20',
  surface: '#1E1E1E',
  surfaceRaised: '#282828',
  bubble: '#303030',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  pattern: '#0E0E0E',
  text: '#F0F0F0',
  textMuted: 'rgba(255, 255, 255, 0.65)',
  textFaint: 'rgba(255, 255, 255, 0.4)',
}

const lightColors: Colors = {
  bg: '#F5F5F7',
  bgRgb: '245, 245, 247',
  surface: '#FFFFFF',
  surfaceRaised: '#ECECEF',
  bubble: '#E7E7EC',
  border: 'rgba(0, 0, 0, 0.08)',
  text: '#17171B',
  textMuted: 'rgba(0, 0, 0, 0.6)',
  textFaint: 'rgba(0, 0, 0, 0.38)',
  accent: '#5F55E0',
  accentSoft: 'rgba(95, 85, 224, 0.12)',
  accentBorder: 'rgba(95, 85, 224, 0.3)',
  danger: '#D6394A',
  dangerSoft: 'rgba(214, 57, 74, 0.08)',
  dangerBorder: 'rgba(214, 57, 74, 0.3)',
  success: '#2F9A5C',
  borderStrong: 'rgba(0, 0, 0, 0.14)',
  pattern: '#ECECEF',
  cast: ['#C26A12', '#1F86B5', '#C0407F', '#2F8F3A', '#6D4FD1', '#9A7A00'],
}

// The light half of the neutral grey theme: the same balanced greys, no violet in them.
const neutralLightColors: Colors = {
  ...lightColors,
  bg: '#F4F4F4',
  bgRgb: '244, 244, 244',
  surface: '#FFFFFF',
  surfaceRaised: '#EBEBEB',
  bubble: '#E6E6E6',
  border: 'rgba(0, 0, 0, 0.08)',
  borderStrong: 'rgba(0, 0, 0, 0.14)',
  pattern: '#EBEBEB',
  text: '#171717',
}

// The light half of OLED: pure white with black ink, as stark as the black one.
const oledLightColors: Colors = {
  ...lightColors,
  bg: '#FFFFFF',
  bgRgb: '255, 255, 255',
  surface: '#F2F2F2',
  surfaceRaised: '#E8E8E8',
  bubble: '#EDEDED',
  border: 'rgba(0, 0, 0, 0.10)',
  borderStrong: 'rgba(0, 0, 0, 0.18)',
  pattern: '#F4F4F4',
  text: '#000000',
}

// Warm paper / linen palette for comfortable reading: soft parchment background, warm dark ink, terracotta accent.
const warmColors: Colors = {
  bg: '#F5EFEB',
  bgRgb: '245, 239, 235',
  surface: '#FFFDF9',
  surfaceRaised: '#EAE2D5',
  bubble: '#E4DBCB',
  border: 'rgba(60, 48, 36, 0.08)',
  borderStrong: 'rgba(60, 48, 36, 0.15)',
  pattern: '#EAE2D5',
  text: '#28231D',
  textMuted: 'rgba(40, 35, 29, 0.62)',
  textFaint: 'rgba(40, 35, 29, 0.40)',
  accent: '#B85D2A',
  accentSoft: 'rgba(184, 93, 42, 0.12)',
  accentBorder: 'rgba(184, 93, 42, 0.32)',
  danger: '#C0392B',
  dangerSoft: 'rgba(192, 57, 43, 0.08)',
  dangerBorder: 'rgba(192, 57, 43, 0.3)',
  success: '#2E7D32',
  cast: ['#B85D2A', '#267385', '#A23B68', '#3F7A3E', '#6B4FB8', '#8F6F00'],
}

// The desktop app takes flat neutral greys: the page a neutral grey rather than
// the near-black of the phone, the sidebar and the groups of settings one step lighter
// (or darker, in light), hairlines that show, and plainer text.
const desktopDarkColors: Colors = {
  ...darkColors,
  bg: '#1E1E1E',
  bgRgb: '30, 30, 30',
  surface: '#262626',
  surfaceRaised: '#303030',
  bubble: '#303030',
  border: '#363636',
  borderStrong: '#424242',
  pattern: '#191919',
  text: '#DADADA',
  textMuted: '#B3B3B3',
  textFaint: '#7A7A7A',
}

const desktopBlackColors: Colors = {
  ...blackColors,
  bg: '#000000',
  bgRgb: '0, 0, 0',
  surface: '#111111',
  surfaceRaised: '#181818',
  bubble: '#181818',
  border: '#242424',
  borderStrong: '#303030',
  pattern: '#040404',
  text: '#DADADA',
  textMuted: '#B3B3B3',
  textFaint: '#7A7A7A',
}

const desktopGreyColors: Colors = {
  ...desktopDarkColors,
  pattern: '#181818',
}

const desktopLightColors: Colors = {
  ...lightColors,
  bg: '#FFFFFF',
  bgRgb: '255, 255, 255',
  surface: '#F6F6F6',
  surfaceRaised: '#EBEBEB',
  bubble: '#EFEFEF',
  border: '#E0E0E0',
  borderStrong: '#D0D0D0',
  pattern: '#F1F1F1',
  text: '#222222',
  textMuted: '#5C5C5C',
  textFaint: '#ABABAB',
}

const desktopWarmColors: Colors = {
  ...warmColors,
  bg: '#F3EDE7',
  bgRgb: '243, 237, 231',
  surface: '#FAF6F0',
  surfaceRaised: '#E8E0D4',
  bubble: '#E8E0D4',
  border: '#DED5C7',
  borderStrong: '#CEC3B3',
  pattern: '#E8E0D4',
  text: '#28231D',
  textMuted: '#685F54',
  textFaint: '#9E9487',
}

// Warm dark palette: cozy deep espresso background, warm amber/terracotta accent, soft ivory text.
const warmDarkColors: Colors = {
  ...darkColors,
  bg: '#181512',
  bgRgb: '24, 21, 18',
  surface: '#221E1A',
  surfaceRaised: '#2C2621',
  bubble: '#373029',
  border: 'rgba(255, 240, 220, 0.08)',
  borderStrong: 'rgba(255, 240, 220, 0.15)',
  pattern: '#120F0D',
  text: '#F2EBE1',
  textMuted: 'rgba(242, 235, 225, 0.65)',
  textFaint: 'rgba(242, 235, 225, 0.40)',
  accent: '#DE7A3E',
  accentSoft: 'rgba(222, 122, 62, 0.16)',
  accentBorder: 'rgba(222, 122, 62, 0.35)',
  danger: '#EA6354',
  dangerSoft: 'rgba(234, 99, 84, 0.12)',
  dangerBorder: 'rgba(234, 99, 84, 0.32)',
  success: '#5DB87A',
  cast: ['#DE7A3E', '#4FAABF', '#D9628C', '#68B068', '#A88AE6', '#D6B445'],
}

const desktopWarmDarkColors: Colors = {
  ...warmDarkColors,
  bg: '#1C1916',
  bgRgb: '28, 25, 22',
  surface: '#24201C',
  surfaceRaised: '#2E2823',
  bubble: '#362F2A',
  border: '#3D362F',
  borderStrong: '#4D443B',
  pattern: '#14110E',
  text: '#EAE2D8',
  textMuted: '#ABA295',
  textFaint: '#7A7266',
}

const desktopOledLightColors: Colors = {
  ...desktopLightColors,
  text: '#000000',
  textMuted: '#4A4A4A',
}

const palettes: Record<ThemeName, Record<Scheme, Colors>> = isDesktop
  ? {
      default: { light: desktopLightColors, dark: desktopDarkColors },
      warm: { light: desktopWarmColors, dark: desktopWarmDarkColors },
      neutral: { light: desktopLightColors, dark: desktopGreyColors },
      oled: { light: desktopOledLightColors, dark: desktopBlackColors },
    }
  : {
      default: { light: lightColors, dark: darkColors },
      warm: { light: warmColors, dark: warmDarkColors },
      neutral: { light: neutralLightColors, dark: greyColors },
      oled: { light: oledLightColors, dark: blackColors },
    }

export const paletteOf = (theme: ThemeName, scheme: Scheme): Colors => palettes[theme][scheme]

// Exported for the handful of places that render before ThemeContextProvider can mount
// (StartupBoundary's error screen, which may appear if the database itself fails to
// open) and so can't read a stored preference — they fall back to the dark palette.
export const colors = darkColors

export const fonts = { prose: FONTS.prose } as const

// A layer that covers its parent exactly (spread into a style).
export const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const

// Ink on an accent-coloured fill.
export const ON_ACCENT = '#FFFFFF'

export const HEADER_ROW_HEIGHT = 52

// Content text (messages, previews, fields) follows Dynamic Type all the way. Controls
// with a set size stop at the largest regular text size, so the accessibility sizes
// don't push their labels out of the capsule, and the header rows grow a little less.
export const CONTROL_FONT_SCALE = 1.35
export const HEADER_FONT_SCALE = 1.2

type ThemeContextValue = {
  colors: Colors
  scheme: Scheme
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

const [ThemeContext, useThemeContext] = createRequiredContext<ThemeContextValue>('useColors/useTheme must be used within ThemeContextProvider')
// The theme as soon as it is picked. Nearly every view of the app reads the theme, and all the
// screens kept mounted under the one shown would repaint in one block that holds the JS thread
// for a moment; so the app takes it deferred instead, in a render React does in the background
// and leaves for a touch, and only the screen the theme is picked on reads it from here at once.
const [UrgentThemeContext, useUrgentThemeContext] = createRequiredContext<ThemeContextValue>('ImmediateTheme must be used within ThemeContextProvider')

export function ThemeContextProvider({
  theme,
  setTheme,
  mode,
  setMode,
  children,
}: {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  children: React.ReactNode
}) {
  const systemScheme = useColorScheme()
  const scheme: Scheme = mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode
  const colors = palettes[theme][scheme]
  // Alerts, action sheets and the keyboard follow the window rather than the app, so
  // a theme picked in the app is passed down to it; 'system' gives it back to iOS.
  // react-native-web has no setColorScheme, and the page has no such windows.
  useEffect(() => {
    Appearance.setColorScheme?.(mode === 'system' ? 'unspecified' : scheme)
  }, [mode, scheme])
  // On the web (the desktop app) the scrollbars are drawn by the browser; they are
  // restyled from the palette so they match the theme instead of the OS default.
  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return
    const thumb = scheme === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.22)'
    const thumbHover = scheme === 'dark' ? 'rgba(255, 255, 255, 0.32)' : 'rgba(0, 0, 0, 0.38)'
    let el = document.getElementById('reverie-scrollbars') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'reverie-scrollbars'
      document.head.appendChild(el)
    }
    el.textContent = `
      :root { color-scheme: ${scheme}; }
      *::-webkit-scrollbar { width: 12px; height: 12px; background: transparent; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-corner { background: transparent; }
      *::-webkit-scrollbar-thumb {
        background-color: ${thumb};
        border: 3px solid transparent;
        background-clip: content-box;
        border-radius: 999px;
      }
      *::-webkit-scrollbar-thumb:hover { background-color: ${thumbHover}; }
      *::-webkit-scrollbar-thumb:active { background-color: ${colors.accent}; }
    `
    if (isDesktop) applyDesktopChrome(colors)
  }, [colors, scheme])
  const value = useMemo(
    () => ({ colors, scheme, theme, setTheme, mode, setMode }),
    [colors, scheme, theme, setTheme, mode, setMode]
  )
  return (
    <UrgentThemeContext.Provider value={value}>
      <DeferredTheme>{children}</DeferredTheme>
    </UrgentThemeContext.Provider>
  )
}

function DeferredTheme({ children }: { children: React.ReactNode }) {
  const value = useDeferredValue(useUrgentThemeContext())
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// The theme for the screen it is picked on, which repaints with the pick while the rest of the
// app follows in the background.
export function ImmediateTheme({ children }: { children: React.ReactNode }) {
  const value = useUrgentThemeContext()
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// What is inside takes the theme's light or dark palette whatever the app's own scheme, as a
// chat does from its picture; null leaves it the app's. Only the app's own views follow:
// alerts and the window keep the app's scheme, which Appearance holds for the whole app.
export function SchemeOverride({ scheme, children }: { scheme: Scheme | null; children: React.ReactNode }) {
  const outer = useThemeContext()
  const value = useMemo(
    () => (!scheme || scheme === outer.scheme ? outer : { ...outer, scheme, colors: palettes[outer.theme][scheme] }),
    [outer, scheme]
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useColors() {
  return useThemeContext().colors
}

export function useTheme() {
  return useThemeContext()
}

// StyleSheet.create bakes in the colors it is given, so styles are built per palette.
// There are only a few palettes, so each factory's result is kept for each of them and
// every instance of a component shares it instead of building its own.
const styleCache = new WeakMap<object, WeakMap<Colors, unknown>>()

// Small text the screens share: a muted note under a control, a link, a status line.
export const textStyles = (colors: Colors) =>
  ({
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
    link: { color: colors.accent, fontSize: 15 },
    linkMuted: { color: colors.textMuted, fontSize: 15 },
  }) as const

export function useStyles<T>(factory: (c: Colors) => T): T {
  const colors = useColors()
  let byPalette = styleCache.get(factory)
  if (!byPalette) {
    byPalette = new WeakMap()
    styleCache.set(factory, byPalette)
  }
  if (!byPalette.has(colors)) byPalette.set(colors, factory(colors))
  return byPalette.get(colors) as T
}
