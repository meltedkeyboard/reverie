import { createContext, useContext, useEffect, useMemo } from 'react'
import { Appearance, Platform, useColorScheme } from 'react-native'

export type Scheme = 'light' | 'dark'
export type ThemePreference = Scheme | 'system'

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
  accent: '#8B5CF6',
  accentSoft: 'rgba(139, 92, 246, 0.16)',
  accentBorder: 'rgba(139, 92, 246, 0.35)',
  danger: '#F0616D',
  dangerSoft: 'rgba(240, 97, 109, 0.1)',
  dangerBorder: 'rgba(240, 97, 109, 0.3)',
  success: '#5FCB8B',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
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
  accent: '#7C3AED',
  accentSoft: 'rgba(124, 58, 237, 0.12)',
  accentBorder: 'rgba(124, 58, 237, 0.3)',
  danger: '#D6394A',
  dangerSoft: 'rgba(214, 57, 74, 0.08)',
  dangerBorder: 'rgba(214, 57, 74, 0.3)',
  success: '#2F9A5C',
  borderStrong: 'rgba(0, 0, 0, 0.14)',
}

const palettes: Record<Scheme, Colors> = { dark: darkColors, light: lightColors }

// Exported for the handful of places that render before ThemeContextProvider can mount
// (StartupBoundary's error screen, which may appear if the database itself fails to
// open) and so can't read a stored preference — they fall back to the dark palette.
export const colors = darkColors

export const fonts = {
  prose: 'Georgia',
} as const

export const HEADER_ROW_HEIGHT = 52

// A no-op on phone widths (always narrower than this), but keeps message bubbles and
// the composer from stretching edge to edge once the desktop pane fills the monitor.
export const CHAT_MAX_WIDTH = 820

type ThemeContextValue = {
  colors: Colors
  scheme: Scheme
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeContextProvider({
  preference,
  setPreference,
  children,
}: {
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
  children: React.ReactNode
}) {
  const systemScheme = useColorScheme()
  const scheme: Scheme = preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference
  // Alerts, action sheets and the keyboard follow the window rather than the app, so
  // a theme picked in the app is passed down to it; 'system' gives it back to iOS.
  useEffect(() => {
    if (Platform.OS !== 'web') Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference)
  }, [preference])
  const value = useMemo(
    () => ({ colors: palettes[scheme], scheme, preference, setPreference }),
    [scheme, preference, setPreference]
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function useThemeContext() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useColors/useTheme must be used within ThemeContextProvider')
  return ctx
}

export function useColors() {
  return useThemeContext().colors
}

export function useTheme() {
  return useThemeContext()
}

// StyleSheet.create bakes in the colors it is given, so styles are built per palette.
// There are only two palettes, so each factory's result is kept for each of them and
// every instance of a component shares it instead of building its own.
const styleCache = new WeakMap<object, WeakMap<Colors, unknown>>()

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
