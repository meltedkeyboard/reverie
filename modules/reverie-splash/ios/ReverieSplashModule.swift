import ExpoModulesCore

public class ReverieSplashModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReverieSplash")

    Function("isAvailable") { () -> Bool in
      return true
    }

    Function("isFinished") { () -> Bool in
      return ReverieSplashManager.shared.isFinished
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
