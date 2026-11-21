const { withPodfile, withXcodeProject } = require('expo/config-plugins')

// Config plugin to guarantee iOS 15.1 compatibility:
// 1. Enforces iOS 15.1 deployment target in Xcode project
// 2. Patches Podfile to set platform :ios, '15.1'
// 3. Monkey-patches Pod::Specification in Podfile to prevent CocoaPods target validation errors
// 4. Sets IPHONEOS_DEPLOYMENT_TARGET = '15.1' for all Pod targets in post_install
const withIosDeploymentTargetPlugin = (config) => {
  // Update Xcode project target build settings
  config = withXcodeProject(config, (mod) => {
    const pbxproj = mod.modResults
    const configurations = pbxproj.pbxXCBuildConfigurationSection()
    for (const key in configurations) {
      if (configurations[key].buildSettings) {
        configurations[key].buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1'
      }
    }
    return mod
  })

  // Update Podfile
  config = withPodfile(config, (mod) => {
    let contents = mod.modResults.contents

    // Set platform :ios, '15.1'
    if (/platform\s+:ios\s*,\s*['"][^'"]+['"]/.test(contents)) {
      contents = contents.replace(/platform\s+:ios\s*,\s*['"][^'"]+['"]/, "platform :ios, '15.1'")
    } else {
      contents = `platform :ios, '15.1'\n` + contents
    }

    // Ruby monkey-patch to ensure CocoaPods accepts all podspecs for iOS 15.1
    const rubyShim = `
# iOS 15 Compatibility Shim: clamp podspec minimum deployment targets to 15.1
class Pod::Specification
  old_deployment_target = instance_method(:deployment_target)
  define_method(:deployment_target) do |platform_name|
    target = old_deployment_target.bind(self).call(platform_name)
    if platform_name.to_s == 'ios' && target && Gem::Version.new(target) > Gem::Version.new('15.1')
      '15.1'
    else
      target
    end
  end
end
`
    if (!contents.includes('iOS 15 Compatibility Shim')) {
      contents = rubyShim + contents
    }

    // Post-install hook to enforce IPHONEOS_DEPLOYMENT_TARGET = '15.1'
    const postInstallSnippet = `
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
      end
    end
`
    if (contents.includes('post_install do |installer|')) {
      if (!contents.includes("IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'")) {
        contents = contents.replace(
          'post_install do |installer|',
          `post_install do |installer|${postInstallSnippet}`
        )
      }
    }

    mod.modResults.contents = contents
    return mod
  })

  return config
}

module.exports = withIosDeploymentTargetPlugin
