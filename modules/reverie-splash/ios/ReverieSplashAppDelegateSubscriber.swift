import ExpoModulesCore
import UIKit

public class ReverieSplashAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func customizeRootView(_ rootView: UIView) {
    ReverieSplashManager.shared.attach(to: rootView)
  }
}
