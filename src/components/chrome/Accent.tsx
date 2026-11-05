import { createContext, useContext, useMemo } from 'react'

import type { AccentMode } from '@/db/prefs/settings'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { avatarUri } from '@/lib/images/avatars'
import { hexRgb } from '@/lib/images/backgroundTone'
import { usePictureColor } from '@/lib/images/pictureColor'
import type { ThemeAccent } from '@/theme'
import { toWallpaperAccent, type ChatLook } from './ChatChrome'

export type AccentValue = {
  // Active theme accent (hex string, soft background, border) or null if default theme accent.
  accent: ThemeAccent | null
  accentColor?: string
  accentSoftColor?: string
  accentBorderColor?: string
  mode: AccentMode
}

export const AccentContext = createContext<AccentValue | null>(null)

export function useAccentContext(): AccentValue {
  const ctx = useContext(AccentContext)
  return (
    ctx ?? {
      accent: null,
      mode: 'theme',
    }
  )
}

// Converts a hex color into ThemeAccent with standard opacity channels.
export function hexToAccent(hex: string): ThemeAccent {
  const raw = hex.trim()
  const clean = raw.startsWith('#') ? raw : `#${raw}`
  const normalized = clean.length === 4
    ? `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`
    : clean.slice(0, 7)
  const [r, g, b] = hexRgb(normalized)
  return {
    accent: normalized,
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.16)`,
    accentBorder: `rgba(${r}, ${g}, ${b}, 0.35)`,
  }
}

type Props = {
  // Specific character or room look when inside a chat or sheet.
  look?: ChatLook | null
  // Explicit accent override if passed.
  accent?: ThemeAccent | null
  children: React.ReactNode
}

// Universal accent provider:
// supports standard theme accent ('theme'), dynamic wallpaper accent ('dynamic'),
// and custom user-chosen hex color ('custom').
export function AccentProvider({ look, accent: explicitAccent, children }: Props) {
  const parent = useContext(AccentContext)
  const { accentMode, customAccentColor, wallpaper } = useChatTextSettings()

  // Character or room specific background wallpaper.
  const lookUri = accentMode === 'dynamic' && look?.background ? avatarUri(look.background, 'backgrounds') : null
  const lookColor = usePictureColor(lookUri)
  const lookAccent = useMemo(() => (lookColor ? toWallpaperAccent(lookColor) : null), [lookColor])

  // Global custom wallpaper (for dynamic mode).
  const globalUri = accentMode === 'dynamic' && wallpaper?.file ? avatarUri(wallpaper.file, 'backgrounds') : null
  const globalColor = usePictureColor(globalUri)
  const globalDynamicAccent = useMemo(() => (globalColor ? toWallpaperAccent(globalColor) : null), [globalColor])

  // Custom accent color.
  const customAccent = useMemo(
    () => (accentMode === 'custom' && customAccentColor ? hexToAccent(customAccentColor) : null),
    [accentMode, customAccentColor]
  )

  const effectiveAccent = useMemo(() => {
    if (explicitAccent !== undefined) return explicitAccent

    if (accentMode === 'custom') {
      return customAccent
    }

    if (accentMode === 'dynamic') {
      if (look?.background) {
        return lookAccent
      }
      return parent?.accent ?? globalDynamicAccent
    }

    // 'theme': use standard theme default (null accent).
    return null
  }, [explicitAccent, accentMode, customAccent, look?.background, lookAccent, parent?.accent, globalDynamicAccent])

  const value = useMemo<AccentValue>(
    () => ({
      accent: effectiveAccent,
      accentColor: effectiveAccent?.accent,
      accentSoftColor: effectiveAccent?.accentSoft,
      accentBorderColor: effectiveAccent?.accentBorder,
      mode: accentMode,
    }),
    [effectiveAccent, accentMode]
  )

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>
}

// Helper hook to resolve the active accent for a look or ambient context.
export function useAccent(look?: ChatLook | null): AccentValue {
  const ambient = useAccentContext()
  const { accentMode, customAccentColor, wallpaper } = useChatTextSettings()

  const lookUri = accentMode === 'dynamic' && look?.background ? avatarUri(look.background, 'backgrounds') : null
  const lookColor = usePictureColor(lookUri)
  const lookAccent = useMemo(() => (lookColor ? toWallpaperAccent(lookColor) : null), [lookColor])

  const globalUri = accentMode === 'dynamic' && wallpaper?.file ? avatarUri(wallpaper.file, 'backgrounds') : null
  const globalColor = usePictureColor(globalUri)
  const globalDynamicAccent = useMemo(() => (globalColor ? toWallpaperAccent(globalColor) : null), [globalColor])

  const customAccent = useMemo(
    () => (accentMode === 'custom' && customAccentColor ? hexToAccent(customAccentColor) : null),
    [accentMode, customAccentColor]
  )

  if (accentMode === 'custom') {
    return {
      accent: customAccent,
      accentColor: customAccent?.accent,
      accentSoftColor: customAccent?.accentSoft,
      accentBorderColor: customAccent?.accentBorder,
      mode: accentMode,
    }
  }

  if (accentMode === 'dynamic' && look?.background) {
    return {
      accent: lookAccent,
      accentColor: lookAccent?.accent,
      accentSoftColor: lookAccent?.accentSoft,
      accentBorderColor: lookAccent?.accentBorder,
      mode: accentMode,
    }
  }

  const fallbackAccent = ambient.accent ?? (accentMode === 'dynamic' ? globalDynamicAccent : null)
  return {
    accent: fallbackAccent,
    accentColor: fallbackAccent?.accent,
    accentSoftColor: fallbackAccent?.accentSoft,
    accentBorderColor: fallbackAccent?.accentBorder,
    mode: accentMode,
  }
}

// Backwards compatibility aliases.
export const DynamicAccentProvider = AccentProvider
export const DynamicAccentContext = AccentContext
export const useDynamicAccent = useAccent
export const useDynamicAccentContext = useAccentContext
export type DynamicAccentValue = AccentValue
