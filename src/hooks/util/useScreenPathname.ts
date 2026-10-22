import { usePathname } from 'expo-router'
import { useRef } from 'react'

// Routes drawn over the screen they open from, which shows through them.
const OVERLAYS = ['/viewer']

// The path of the screen being looked at: the viewer goes over it see-through, so the screen
// under it stays the place the sidebar and the tabs show while a picture is open.
export function useScreenPathname() {
  const pathname = usePathname()
  const screen = useRef(pathname)
  if (!OVERLAYS.includes(pathname)) screen.current = pathname
  return screen.current
}
