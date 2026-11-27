import ExpoModulesCore
import Foundation
import UserNotifications

public class ReverieNotificationsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReverieNotifications")

    Events("onNotificationAction", "onBackgroundExpiring")

    OnCreate {
      let center = ReverieNotificationsCenter.shared
      center.installDelegate()
      center.onActionEvent = { [weak self] payload in
        self?.sendEvent("onNotificationAction", payload)
      }
      center.onBackgroundExpiring = { [weak self] taskId in
        self?.sendEvent("onBackgroundExpiring", ["taskId": taskId])
      }
    }

    OnDestroy {
      let center = ReverieNotificationsCenter.shared
      center.onActionEvent = nil
      center.onBackgroundExpiring = nil
    }

    AsyncFunction("getPermissionStatus") { (promise: Promise) in
      UNUserNotificationCenter.current().getNotificationSettings { settings in
        promise.resolve(Self.statusName(settings.authorizationStatus))
      }
    }

    AsyncFunction("requestPermission") { (promise: Promise) in
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
        UNUserNotificationCenter.current().getNotificationSettings { settings in
          if granted {
            promise.resolve("granted")
          } else {
            promise.resolve(Self.statusName(settings.authorizationStatus))
          }
        }
      }
    }

    AsyncFunction("openSystemSettings") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
          promise.resolve(nil)
          return
        }
        UIApplication.shared.open(url, options: [:]) { _ in
          promise.resolve(nil)
        }
      }
    }

    Function("configureCategories") { (labels: [String: String]) in
      ReverieNotificationsCenter.shared.configureCategories(
        replyTitle: labels["replyTitle"] ?? "Reply",
        replyPlaceholder: labels["replyPlaceholder"] ?? "Message...",
        sendTitle: labels["sendTitle"] ?? "Send",
        continueTitle: labels["continueTitle"] ?? "Continue",
        retryTitle: labels["retryTitle"] ?? "Retry"
      )
    }

    Function("configureChannels") { (_: [String: String]) in
      // Notification channels are Android-only.
    }

    Function("setActiveRoute") { (route: String?) in
      ReverieNotificationsCenter.shared.setActiveRoute(route)
    }

    AsyncFunction("schedule") { (payload: [String: Any], promise: Promise) in
      let id = payload["id"] as? String ?? UUID().uuidString
      let content = ReverieNotificationsCenter.shared.buildContent(from: payload)
      let trigger: UNNotificationTrigger?
      if let fireAtMs = payload["fireAtMs"] as? Double {
        let interval = max(1.0, (fireAtMs - Date().timeIntervalSince1970 * 1000.0) / 1000.0)
        trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
      } else if let delay = payload["delaySeconds"] as? Double, delay > 0 {
        trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1.0, delay), repeats: false)
      } else {
        trigger = nil
      }
      let req = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
      UNUserNotificationCenter.current().add(req) { error in
        if let error {
          promise.reject("E_NOTIFY", error.localizedDescription, error)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("cancel") { (id: String, promise: Promise) in
      let center = UNUserNotificationCenter.current()
      center.removePendingNotificationRequests(withIdentifiers: [id])
      center.removeDeliveredNotifications(withIdentifiers: [id])
      promise.resolve(nil)
    }

    AsyncFunction("cancelByTag") { (tag: String, promise: Promise) in
      let center = UNUserNotificationCenter.current()
      center.getPendingNotificationRequests { pending in
        let ids = pending.filter { ($0.content.userInfo["tag"] as? String) == tag }.map(\.identifier)
        center.removePendingNotificationRequests(withIdentifiers: ids)
        center.getDeliveredNotifications { delivered in
          let deliveredIds = delivered.filter { ($0.request.content.userInfo["tag"] as? String) == tag }.map(\.request.identifier)
          center.removeDeliveredNotifications(withIdentifiers: deliveredIds)
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("cancelAll") { (promise: Promise) in
      let center = UNUserNotificationCenter.current()
      center.removeAllPendingNotificationRequests()
      center.removeAllDeliveredNotifications()
      promise.resolve(nil)
    }

    AsyncFunction("listScheduled") { (promise: Promise) in
      UNUserNotificationCenter.current().getPendingNotificationRequests { pending in
        let items: [[String: Any]] = pending.map { req in
          var entry: [String: Any] = ["id": req.identifier]
          if let tag = req.content.userInfo["tag"] as? String {
            entry["tag"] = tag
          }
          if let trigger = req.trigger as? UNTimeIntervalNotificationTrigger,
             let date = trigger.nextTriggerDate() {
            entry["fireAtMs"] = date.timeIntervalSince1970 * 1000.0
          } else if let trigger = req.trigger as? UNCalendarNotificationTrigger,
                    let date = trigger.nextTriggerDate() {
            entry["fireAtMs"] = date.timeIntervalSince1970 * 1000.0
          }
          return entry
        }
        promise.resolve(items)
      }
    }

    Function("consumePendingEvents") { () -> [[String: Any]] in
      return ReverieNotificationsCenter.shared.consumePendingEvents()
    }

    AsyncFunction("beginBackgroundTask") { (name: String, promise: Promise) in
      ReverieNotificationsCenter.shared.beginBackgroundTask(name: name) { taskId in
        promise.resolve(taskId)
      }
    }

    Function("endBackgroundTask") { (taskId: Int) in
      ReverieNotificationsCenter.shared.endBackgroundTask(taskId)
    }
  }

  private static func statusName(_ status: UNAuthorizationStatus) -> String {
    switch status {
    case .authorized, .provisional, .ephemeral:
      return "granted"
    case .denied:
      return "denied"
    case .notDetermined:
      return "undetermined"
    @unknown default:
      return "undetermined"
    }
  }
}
