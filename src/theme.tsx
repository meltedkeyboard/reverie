import { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'

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
  danger: string
  success: string
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
  danger: '#F0616D',
  success: '#5FCB8B',
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
  danger: '#D6394A',
  success: '#2F9A5C',
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

// The one hook screens and components use to read the live palette. Because
// StyleSheet.create bakes in whatever values it's given at call time, callers must build
// their `styles` inside the component (typically `useMemo(() => StyleSheet.create(...), [colors])`)
// rather than at module scope, or a theme switch won't repaint them.
export function useColors() {
  return useThemeContext().colors
}

export function useTheme() {
  return useThemeContext()
}

export function hairlineStyle(c: Colors) {
  return { borderWidth: 1, borderColor: c.border } as const
}
