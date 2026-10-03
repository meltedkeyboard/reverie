const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on the web ships its engine as a .wasm file
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer (needed by the sqlite worker) requires cross-origin isolation
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

// The synchronous File / Directory API has no web build, so the web gets its own
const path = require('path');
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (platform === 'web' && name === 'expo-file-system') {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'src/web/expo-file-system.ts') };
  }
  return (upstream ?? context.resolveRequest)(context, name, platform);
};

module.exports = config;
