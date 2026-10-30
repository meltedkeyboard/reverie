const fs = require('fs')
const path = require('path')
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins')

// The app's page in the iOS Settings app: the version and the copyright, as in Settings >
// About of the app itself, and the link to GitHub under them. A settings bundle has no
// buttons and its text cannot be tapped, so the link is only written out. The values are
// fixed at prebuild, the version taken from app.json with the build number app.config.js
// adds; the copyright and the address repeat
// src/lib/core/version.ts.
const COPYRIGHT = '© 2026 meltedkeyboard'
const REPO = 'github.com/meltedkeyboard/reverie'

const STRINGS = {
  en: {
    About: 'About',
    Version: 'Version',
    Copyright: 'Copyright',
    Footer: `Reverie is open source. The code, the news and a place to leave a star: ${REPO}`,
  },
  ru: {
    About: 'О приложении',
    Version: 'Версия',
    Copyright: 'Авторские права',
    Footer: `У Reverie открытый код. Исходники, новости и место для звёздочки: ${REPO}`,
  },
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const titleValue = (title, key, value) => `    <dict>
      <key>Type</key>
      <string>PSTitleValueSpecifier</string>
      <key>Title</key>
      <string>${title}</string>
      <key>Key</key>
      <string>${key}</string>
      <key>DefaultValue</key>
      <string>${escape(value)}</string>
    </dict>`

const rootPlist = (version) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>StringsTable</key>
  <string>Root</string>
  <key>PreferenceSpecifiers</key>
  <array>
    <dict>
      <key>Type</key>
      <string>PSGroupSpecifier</string>
      <key>Title</key>
      <string>About</string>
      <key>FooterText</key>
      <string>Footer</string>
    </dict>
${titleValue('Version', 'reverie_version', version)}
${titleValue('Copyright', 'reverie_copyright', COPYRIGHT)}
  </array>
</dict>
</plist>
`

const rootStrings = (strings) =>
  Object.entries(strings)
    .map(([key, text]) => `"${key}" = "${text.replace(/"/g, '\\"')}";`)
    .join('\n') + '\n'

const withBuild = (version, build) => (build ? `${version} (${build})` : version)

const withSettingsFiles = (cfg) =>
  withDangerousMod(cfg, [
    'ios',
    (mod) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot)
      const bundle = path.join(mod.modRequest.platformProjectRoot, projectName, 'Settings.bundle')
      fs.mkdirSync(bundle, { recursive: true })
      fs.writeFileSync(path.join(bundle, 'Root.plist'), rootPlist(withBuild(mod.version ?? '1.0.0', mod.ios?.buildNumber)))
      for (const [locale, strings] of Object.entries(STRINGS)) {
        fs.mkdirSync(path.join(bundle, `${locale}.lproj`), { recursive: true })
        fs.writeFileSync(path.join(bundle, `${locale}.lproj`, 'Root.strings'), rootStrings(strings))
      }
      return mod
    },
  ])

const withSettingsBundle = (cfg) =>
  withXcodeProject(cfg, (mod) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot)
    const filepath = `${projectName}/Settings.bundle`
    if (!mod.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath, groupName: projectName, isBuildFile: true, project: mod.modResults })
    }
    return mod
  })

module.exports = (cfg) => withSettingsBundle(withSettingsFiles(cfg))
