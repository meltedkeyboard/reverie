import ExpoModulesCore
import UIKit

public class ReverieSplashModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReverieSplash")

    Function("isAvailable") { () -> Bool in
      return true
    }

    Function("isFinished") { () -> Bool in
      return ReverieSplashManager.shared.isFinished
    }

    // The radius of the screen's own corners, so a screen pushed aside can round off exactly
    // like the glass. UIKit keeps it private; a device with square corners gives 0.
    Function("displayCornerRadius") { () -> Double in
      let radius = UIScreen.main.value(forKey: "_displayCornerRadius") as? CGFloat
      return Double(radius ?? 0)
    }

    AsyncFunction("dismiss") { () -> Bool in
      return await withCheckedContinuation { continuation in
        ReverieSplashManager.shared.dismiss {
          continuation.resume(returning: true)
        }
      }
    }
  }
}
