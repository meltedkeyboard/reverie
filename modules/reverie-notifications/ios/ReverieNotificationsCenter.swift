import Foundation
import Intents
import UIKit
import UserNotifications

final class ReverieNotificationsCenter: NSObject, UNUserNotificationCenterDelegate {
  static let shared = ReverieNotificationsCenter()

  private let lock = NSLock()
  private var pendingEvents: [[String: Any]] = []
  private var bgTasks: [Int: UIBackgroundTaskIdentifier] = [:]
  private var nextBgTaskId = 1
  private var activeRoute: String?

  var onActionEvent: (([String: Any]) -> Void)?
  var onBackgroundExpiring: ((Int) -> Void)?

  private override init() {
    super.init()
  }

  func installDelegate() {
    UNUserNotificationCenter.current().delegate = self
  }

  func setActiveRoute(_ route: String?) {
    lock.lock()
    activeRoute = route
    lock.unlock()
  }

  func configureCategories(
    replyTitle: String,
    replyPlaceholder: String,
    sendTitle: String,
    continueTitle: String,
    retryTitle: String
  ) {
    let replyAction = UNTextInputNotificationAction(
      identifier: "REPLY",
      title: replyTitle,
      options: [],
      textInputButtonTitle: sendTitle,
      textInputPlaceholder: replyPlaceholder
    )
    let continueAction = UNNotificationAction(
      identifier: "CONTINUE",
      title: continueTitle,
      options: []
    )
    let retryAction = UNNotificationAction(
      identifier: "RETRY",
      title: retryTitle,
      options: [.foreground]
    )

    let chatActions: [UNNotificationAction] = continueTitle.isEmpty ? [replyAction] : [replyAction, continueAction]

    let chatCategory = UNNotificationCategory(
      identifier: "chat_reply",
      actions: chatActions,
      intentIdentifiers: ["INSendMessageIntent"],
      options: []
    )
    let roomCategory = UNNotificationCategory(
      identifier: "room_reply",
      actions: chatActions,
      intentIdentifiers: ["INSendMessageIntent"],
      options: []
    )
    let errorCategory = UNNotificationCategory(
      identifier: "stream_error",
      actions: [retryAction],
      intentIdentifiers: [],
      options: []
    )
    let defaultCategory = UNNotificationCategory(
      identifier: "default",
      actions: [],
      intentIdentifiers: [],
      options: []
    )
    UNUserNotificationCenter.current().setNotificationCategories([
      chatCategory,
      roomCategory,
      errorCategory,
      defaultCategory,
    ])
  }

  func consumePendingEvents() -> [[String: Any]] {
    lock.lock()
    let items = pendingEvents
    pendingEvents.removeAll()
    lock.unlock()
    return items
  }

  func beginBackgroundTask(name: String, completion: @escaping (Int) -> Void) {
    DispatchQueue.main.async {
      self.lock.lock()
      let id = self.nextBgTaskId
      self.nextBgTaskId += 1
      self.lock.unlock()

      var identifier: UIBackgroundTaskIdentifier = .invalid
      identifier = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
        self?.onBackgroundExpiring?(id)
        self?.endBackgroundTask(id)
      }

      if identifier == .invalid {
        completion(0)
        return
      }

      self.lock.lock()
      self.bgTasks[id] = identifier
      self.lock.unlock()
      completion(id)
    }
  }

  func endBackgroundTask(_ id: Int) {
    guard id > 0 else { return }
    DispatchQueue.main.async {
      self.lock.lock()
      let identifier = self.bgTasks.removeValue(forKey: id)
      self.lock.unlock()
      if let identifier, identifier != .invalid {
        UIApplication.shared.endBackgroundTask(identifier)
      }
    }
  }

  func buildContent(from payload: [String: Any]) -> UNNotificationContent {
    let mutable = UNMutableNotificationContent()
    mutable.title = payload["title"] as? String ?? ""
    if let subtitle = payload["subtitle"] as? String, !subtitle.isEmpty {
      mutable.subtitle = subtitle
    }
    mutable.body = payload["body"] as? String ?? ""
    let soundOn = payload["sound"] as? Bool ?? true
    mutable.sound = soundOn ? .default : nil

    let category = payload["category"] as? String ?? "default"
    mutable.categoryIdentifier = category

    if let threadId = payload["threadId"] as? String, !threadId.isEmpty {
      mutable.threadIdentifier = threadId
    }

    var userInfo: [AnyHashable: Any] = [:]
    if let tag = payload["tag"] as? String { userInfo["tag"] = tag }
    if let route = payload["route"] as? String { userInfo["route"] = route }
    if let kind = payload["kind"] as? String { userInfo["kind"] = kind }
    if let meta = payload["meta"] as? [String: Any] { userInfo["meta"] = meta }
    if let presentInForeground = payload["presentInForeground"] as? Bool {
      userInfo["presentInForeground"] = presentInForeground
    }
    mutable.userInfo = userInfo

    let avatarStyle = payload["avatarStyle"] as? String ?? "none"
    let avatarPath = payload["avatarPath"] as? String
    let senderName = payload["senderName"] as? String

    if avatarStyle == "communication", let senderName, !senderName.isEmpty {
      if let updated = buildCommunicationContent(
        base: mutable,
        senderName: senderName,
        avatarPath: avatarPath,
        threadId: payload["threadId"] as? String,
        isGroup: payload["isGroup"] as? Bool ?? false,
        groupTitle: mutable.title
      ) {
        return updated
      }
    }

    if avatarStyle != "none", let avatarPath, let attachment = makeAttachment(from: avatarPath) {
      mutable.attachments = [attachment]
    }
    return mutable
  }

  private func buildCommunicationContent(
    base: UNMutableNotificationContent,
    senderName: String,
    avatarPath: String?,
    threadId: String?,
    isGroup: Bool,
    groupTitle: String
  ) -> UNNotificationContent? {
    let handleValue = threadId?.isEmpty == false ? threadId! : senderName
    let handle = INPersonHandle(value: handleValue, type: .unknown)
    var personImage: INImage?
    if let avatarPath, let url = localFileURL(avatarPath), let data = try? Data(contentsOf: url) {
      personImage = INImage(imageData: data)
    }
    let sender = INPerson(
      personHandle: handle,
      nameComponents: nil,
      displayName: senderName,
      image: personImage,
      contactIdentifier: nil,
      customIdentifier: handleValue
    )
    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: base.body,
      speakableGroupName: isGroup ? INSpeakableString(spokenPhrase: groupTitle) : nil,
      conversationIdentifier: handleValue,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate(completion: nil)
    return try? base.updating(from: intent)
  }

  private func makeAttachment(from rawPath: String) -> UNNotificationAttachment? {
    guard let src = localFileURL(rawPath),
          FileManager.default.fileExists(atPath: src.path) else {
      return nil
    }
    let ext = src.pathExtension.isEmpty ? "jpg" : src.pathExtension
    let tmp = FileManager.default.temporaryDirectory
      .appendingPathComponent("reverie-notif-\(UUID().uuidString).\(ext)")
    do {
      if FileManager.default.fileExists(atPath: tmp.path) {
        try FileManager.default.removeItem(at: tmp)
      }
      try FileManager.default.copyItem(at: src, to: tmp)
      return try UNNotificationAttachment(identifier: "avatar", url: tmp, options: nil)
    } catch {
      return nil
    }
  }

  private func localFileURL(_ raw: String) -> URL? {
    if raw.hasPrefix("file://") {
      return URL(string: raw)
    }
    return URL(fileURLWithPath: raw)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    let info = notification.request.content.userInfo
    let present = info["presentInForeground"] as? Bool ?? false
    if !present {
      completionHandler([])
      return
    }
    let route = info["route"] as? String
    lock.lock()
    let current = activeRoute
    lock.unlock()
    if let route, let current, route == current {
      completionHandler([])
      return
    }
    let soundOn = notification.request.content.sound != nil
    completionHandler(soundOn ? [.banner, .list, .sound] : [.banner, .list])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let req = response.notification.request
    let info = req.content.userInfo
    let rawAction = response.actionIdentifier
    let actionId: String
    if rawAction == UNNotificationDefaultActionIdentifier {
      actionId = "default"
    } else if rawAction == UNNotificationDismissActionIdentifier {
      completionHandler()
      return
    } else {
      actionId = rawAction
    }

    var event: [String: Any] = [
      "id": req.identifier,
      "actionId": actionId,
    ]
    if let route = info["route"] as? String { event["route"] = route }
    if let kind = info["kind"] as? String { event["kind"] = kind }
    if let meta = info["meta"] as? [String: Any] { event["meta"] = meta }
    if let textResponse = response as? UNTextInputNotificationResponse {
      event["replyText"] = textResponse.userText
    }

    if let listener = onActionEvent {
      listener(event)
    } else {
      lock.lock()
      pendingEvents.append(event)
      lock.unlock()
    }
    completionHandler()
  }
}
