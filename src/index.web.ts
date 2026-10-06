// The web file system lives in IndexedDB, so it has to be read in before any module that
// touches it is evaluated.
import { loadFileSystem } from './web/expo-file-system'

loadFileSystem().then(() => require('expo-router/entry'))
