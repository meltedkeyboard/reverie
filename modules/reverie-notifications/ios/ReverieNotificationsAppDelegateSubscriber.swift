import ExpoModulesCore
import UIKit

public class ReverieNotificationsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    ReverieNotificationsCenter.shared.installDelegate()
    return true
  }
}
