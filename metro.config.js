const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// expo-sqlite runs SQLite as a WebAssembly worker in the browser, and Metro does
// not treat .wasm as an asset out of the box.
config.resolver.assetExts.push('wasm')

module.exports = config
