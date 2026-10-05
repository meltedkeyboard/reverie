import { useEffect, useMemo } from 'react'
import { Appearance, useColorScheme } from 'react-native'
import { applyDesktopChrome } from '@/lib/desktopChrome'
import { FONTS, isDesktop, isWeb } from '@/lib/platform'
import { createRequiredContext } from '@/lib/requiredContext'

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
  cast: ['#F0A35E', '#6CC4E8', '#E779B2', '#7FD17F', '#B99BFF', '#F2D46B'],
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
  cast: ['#C26A12', '#1F86B5', '#C0407F', '#2F8F3A', '#6D4FD1', '#9A7A00'],
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
  text: '#DADADA',
  textMuted: '#B3B3B3',
  textFaint: '#7A7A7A',
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
  text: '#222222',
  textMuted: '#5C5C5C',
  textFaint: '#ABABAB',
}

const palettes: Record<Scheme, Colors> = isDesktop
  ? { dark: desktopDarkColors, light: desktopLightColors }
  : { dark: darkColors, light: lightColors }

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
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
}

const [ThemeContext, useThemeContext] = createRequiredContext<ThemeContextValue>('useColors/useTheme must be used within ThemeContextProvider')

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
  // react-native-web has no setColorScheme, and the page has no such windows.
  useEffect(() => {
    Appearance.setColorScheme?.(preference === 'system' ? 'unspecified' : preference)
  }, [preference])
  // On the web (the desktop app) the scrollbars are drawn by the browser; they are
  // restyled from the palette so they match the theme instead of the OS default.
  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return
    const c = palettes[scheme]
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
      *::-webkit-scrollbar-thumb:active { background-color: ${c.accent}; }
    `
    if (isDesktop) applyDesktopChrome(c)
  }, [scheme])
  const value = useMemo(
    () => ({ colors: palettes[scheme], scheme, preference, setPreference }),
    [scheme, preference, setPreference]
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
// There are only two palettes, so each factory's result is kept for each of them and
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
