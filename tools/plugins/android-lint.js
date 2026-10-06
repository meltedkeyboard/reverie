const { withAppBuildGradle } = require('expo/config-plugins')

// src/locales/permissions/ru.json carries iOS Info.plist strings, and Expo copies the locale file into
// Android resources too, where lint rejects them as translations without a default.
module.exports = (cfg) =>
  withAppBuildGradle(cfg, (mod) => {
    if (!mod.modResults.contents.includes("disable 'ExtraTranslation'")) {
      mod.modResults.contents += "\nandroid {\n    lint {\n        disable 'ExtraTranslation'\n    }\n}\n"
    }
    return mod
  })
