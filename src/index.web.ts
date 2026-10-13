// The web file system lives in IndexedDB, so it has to be read in before any module that
// touches it is evaluated.
import { loadFileSystem } from './web/expo-file-system'

if (typeof document !== 'undefined' && !document.getElementById('reverie-font-instrument-serif')) {
  const link = document.createElement('link')
  link.id = 'reverie-font-instrument-serif'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap'
  document.head.appendChild(link)
}

loadFileSystem().then(() => require('expo-router/entry'))

