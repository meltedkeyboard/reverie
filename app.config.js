const { execSync } = require('child_process')

// The build number is the count of commits, so it grows with every change and never has to
// be written by hand. It becomes the native build number (CFBundleVersion, versionCode) and
// goes to the app in extra.build, where Settings > About shows it after the version. The CI
// checkout must hold the whole history (fetch-depth: 0), or the count is 1. Without git the
// app shows the version alone.
function buildNumber() {
  try {
    const count = Number(execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim())
    return count > 0 ? count : undefined
  } catch {
    return undefined
  }
}

module.exports = ({ config }) => {
  const build = buildNumber()
  if (build === undefined) return config
  return {
    ...config,
    ios: { ...config.ios, buildNumber: String(build) },
    android: { ...config.android, versionCode: build },
    extra: { ...config.extra, build },
  }
}
