import { useMemo } from 'react'

import ru from '@/locales/ru.json'
import en from '@/locales/en.json'
import { createRequiredContext } from '@/lib/core/requiredContext'

export type Locale = 'ru' | 'en'
export type LocalePreference = Locale | 'system'

const catalogs: Record<Locale, Record<string, string>> = { ru, en }

function systemLocale(): Locale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale
    return tag.toLowerCase().startsWith('en') ? 'en' : 'ru'
  } catch {
    return 'ru'
  }
}

export function resolveLocale(preference: LocalePreference): Locale {
  return preference === 'system' ? systemLocale() : preference
}

// Kept in sync by LocaleContextProvider so module-level code (dialogs, API errors,
// message actions) that runs outside any component can still read the active locale.
let activeLocale: Locale = resolveLocale('system')

export function getLocale(): Locale {
  return activeLocale
}

// On Halloween the warm theme goes by a seasonal name in English, read at render so the
// name comes and goes with the date.
function seasonal(key: string): string {
  if (activeLocale !== 'en' || key !== 'theme.warm') return key
  const now = new Date()
  return now.getMonth() === 9 && now.getDate() === 31 ? 'theme.warmHalloween' : key
}

export function t(key: string, vars?: Record<string, string | number>): string {
  key = seasonal(key)
  const template = catalogs[activeLocale][key] ?? catalogs.ru[key] ?? key
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}

type LocaleContextValue = {
  locale: Locale
  preference: LocalePreference
  setPreference: (pref: LocalePreference) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

export const [LocaleContext, useTranslation] = createRequiredContext<LocaleContextValue>('useTranslation must be used within LocaleContextProvider')

export function LocaleContextProvider({
  preference,
  setPreference,
  children,
}: {
  preference: LocalePreference
  setPreference: (pref: LocalePreference) => void
  children: React.ReactNode
}) {
  const locale = resolveLocale(preference)
  activeLocale = locale
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, preference, setPreference, t: (key, vars) => t(key, vars) }),
    [locale, preference, setPreference]
  )
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

