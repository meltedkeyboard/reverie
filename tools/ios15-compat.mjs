import fs from 'fs'
import path from 'path'

// Patches all .podspec files across node_modules and modules to lower the minimum iOS requirement
// to 15.1 (the lowest version supported by React Native 0.88, which runs on iPhone 6s on iOS 15).
function patchPodspecsIn(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '.git') patchPodspecsIn(full)
    } else if (entry.isFile() && entry.name.endsWith('.podspec')) {
      const content = fs.readFileSync(full, 'utf8')
      const updated = content.replace(/(:\s*ios\s*=>\s*['"])(?:1[6-9]|[2-9][0-9])(?:\.[0-9]+)*(['"])/g, '$115.1$2')
      if (updated !== content) {
        fs.writeFileSync(full, updated, 'utf8')
        console.log(`[ios15-compat] Patched ${path.relative(process.cwd(), full)} -> iOS 15.1`)
      }
    }
  }
}

// Patch expo-screen-orientation: guard requestGeometryUpdate and setNeedsUpdateOfSupportedInterfaceOrientations with if #available(iOS 16.0, *)
function patchScreenOrientation() {
  const file = path.resolve('node_modules/expo-screen-orientation/ios/ScreenOrientationRegistry.swift')
  if (!fs.existsSync(file)) return
  let content = fs.readFileSync(file, 'utf8')
  if (content.includes('if #available(iOS 16.0, *)') && content.includes('windowScene?.requestGeometryUpdate')) return

  const target = `      let windowScene = SceneGeometry.windowScene(for: self.rootViewController?.view)
      windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: orientationMask)) { error in
        #if DEBUG
        log.warn(
          "Couldn't lock the screen orientation because the system refused the request. This happens "
          + "when your app is resizable, such as iPad multitasking, iPhone Mirroring, or any app on "
          + "iOS 27 and later, where a supported orientation is only a preference. Design your screens "
          + "to adapt to the available space, or on iPad set \`ios.requireFullScreen\` to \`true\` in your "
          + "app config. See https://docs.expo.dev/versions/latest/sdk/screen-orientation/ "
          + "Underlying error: \\(error.localizedDescription)"
        )
        #endif
      }
      self.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()`

  const replacement = `      if #available(iOS 16.0, *) {
        let windowScene = SceneGeometry.windowScene(for: self.rootViewController?.view)
        windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: orientationMask)) { error in
          #if DEBUG
          log.warn(
            "Couldn't lock the screen orientation because the system refused the request. This happens "
            + "when your app is resizable, such as iPad multitasking, iPhone Mirroring, or any app on "
            + "iOS 27 and later, where a supported orientation is only a preference. Design your screens "
            + "to adapt to the available space, or on iPad set \`ios.requireFullScreen\` to \`true\` in your "
            + "app config. See https://docs.expo.dev/versions/latest/sdk/screen-orientation/ "
            + "Underlying error: \\(error.localizedDescription)"
          )
          #endif
        }
        self.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
      }`

  if (content.includes(target)) {
    content = content.replace(target, replacement)
    fs.writeFileSync(file, content, 'utf8')
    console.log('[ios15-compat] Patched ScreenOrientationRegistry.swift')
  }
}

// Patch expo-video: guard requestGeometryUpdate with if #available(iOS 16.0, *)
function patchExpoVideo() {
  const file = path.resolve('node_modules/expo-video/ios/OrientationAVPlayerViewController.swift')
  if (!fs.existsSync(file)) return
  let content = fs.readFileSync(file, 'utf8')
  if (content.includes('if #available(iOS 16.0, *)') && content.includes('windowScene?.requestGeometryUpdate')) return

  const target = `  private func forceRotationUpdate() {
    let windowScene = SceneGeometry.windowScene(for: view)
    windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: fullscreenOrientation))
  }`

  const replacement = `  private func forceRotationUpdate() {
    if #available(iOS 16.0, *) {
      let windowScene = SceneGeometry.windowScene(for: view)
      windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: fullscreenOrientation))
    }
  }`

  if (content.includes(target)) {
    content = content.replace(target, replacement)
    fs.writeFileSync(file, content, 'utf8')
    console.log('[ios15-compat] Patched OrientationAVPlayerViewController.swift')
  }
}

// Patch expo-modules-core: guard SceneGeometry.effectiveGeometry with if #available(iOS 16.0, *)
function patchSceneGeometry() {
  const file = path.resolve('node_modules/expo-modules-core/ios/Utilities/SceneGeometry.swift')
  if (!fs.existsSync(file)) return
  let content = fs.readFileSync(file, 'utf8')
  if (content.includes('if #available(iOS 16.0, *)') && content.includes('effectiveGeometry')) return

  const target = `  static func interfaceOrientation(for view: UIView? = nil) -> UIInterfaceOrientation {
    return windowScene(for: view)?.effectiveGeometry.interfaceOrientation ?? .unknown
  }`

  const replacement = `  static func interfaceOrientation(for view: UIView? = nil) -> UIInterfaceOrientation {
    if #available(iOS 16.0, *) {
      return windowScene(for: view)?.effectiveGeometry.interfaceOrientation ?? .unknown
    } else {
      return windowScene(for: view)?.interfaceOrientation ?? .unknown
    }
  }`

  if (content.includes(target)) {
    content = content.replace(target, replacement)
    fs.writeFileSync(file, content, 'utf8')
    console.log('[ios15-compat] Patched SceneGeometry.swift')
  }
}

patchPodspecsIn(path.resolve('node_modules'))
patchPodspecsIn(path.resolve('modules'))
patchScreenOrientation()
patchExpoVideo()
patchSceneGeometry()
