import type { Colors } from '@/theme'

type DesktopBridge = { platform: string; setTitleBar?: (colors: { color: string; symbolColor: string }) => void }

export function desktopBridge(): DesktopBridge | null {
  return (globalThis as { reverieDesktop?: DesktopBridge }).reverieDesktop ?? null
}

let listening = false

// What makes the Electron window behave like an app rather than a page: chrome that
// can't be selected or dragged off, the arrow cursor on controls, focus rings only for the
// keyboard, no zoom of the whole window, and the system buttons tinted to the title bar.
export function applyDesktopChrome(colors: Colors) {
  if (typeof document === 'undefined') return
  let el = document.getElementById('reverie-desktop') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'reverie-desktop'
    document.head.appendChild(el)
  }
  el.textContent = `
    html, body { overscroll-behavior: none; background: ${colors.bg}; }
    body {
      user-select: none;
      -webkit-font-smoothing: antialiased;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Inter, Ubuntu, sans-serif;
    }
    input, textarea, [contenteditable="true"] { user-select: text; cursor: text; }
    img { -webkit-user-drag: none; }
    [role="button"], [role="link"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], div[tabindex="0"] {
      cursor: default !important;
    }
    a[href^="http"] { cursor: pointer !important; }
    :focus { outline: none; }
    :not(input):not(textarea):not([contenteditable="true"]):focus-visible { outline: 2px solid ${colors.accentBorder}; outline-offset: 1px; border-radius: 6px; }
    ::selection { background: ${colors.accentSoft}; }
    [data-titlebar="drag"] { -webkit-app-region: drag; }
    [data-titlebar="drag"] [role="button"], [data-titlebar="nodrag"] { -webkit-app-region: no-drag; }
  `
  desktopBridge()?.setTitleBar?.({ color: colors.surface, symbolColor: colors.textMuted })
  if (!listening) {
    listening = true
    // Ctrl+wheel and a pinch on the touchpad zoom a page; an app keeps its size.
    window.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false })
  }
}
