import { createContext, useContext } from 'react'

// A context with no default value: the hook that reads it throws when there is no
// provider above, instead of every caller checking for null.
export function createRequiredContext<T>(missingMessage: string) {
  const Context = createContext<T | null>(null)
  const useRequired = () => {
    const value = useContext(Context)
    if (!value) throw new Error(missingMessage)
    return value
  }
  return [Context, useRequired] as const
}
