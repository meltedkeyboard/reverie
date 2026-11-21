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

patchPodspecsIn(path.resolve('node_modules'))
patchPodspecsIn(path.resolve('modules'))
