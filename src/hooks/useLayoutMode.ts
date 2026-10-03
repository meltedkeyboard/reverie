import { useWindowDimensions } from 'react-native'

// The window is wide enough for a sidebar beside the chat (a desktop window, a tablet).
export const WIDE_BREAKPOINT = 900
// The reading column of a chat and the column of a form; narrower than any phone is
// wide, so on a phone both caps do nothing.
export const CHAT_COLUMN = 760
export const FORM_COLUMN = 720

export function useLayoutMode(): 'compact' | 'wide' {
  return useWindowDimensions().width >= WIDE_BREAKPOINT ? 'wide' : 'compact'
}

// Side padding that centers content of at most `column` points in a window `width` wide.
export function columnInset(width: number, column: number, min: number) {
  return Math.max(min, (width - column) / 2)
}
