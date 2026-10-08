import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

// A character dragged out of the list: the whole character as a backup archive for Files or
// another Reverie, and the Character Card PNG for Photos. JS builds the files only when a
// drop asks for them, since an archive with all the chats can take a while.
let characterType = "app.reverie.character"

// Completions of the file representations waiting for JS, by token.
private var pending: [String: (URL?, Bool, Error?) -> Void] = [:]
private let pendingLock = NSLock()

private func takePending(_ token: String) -> ((URL?, Bool, Error?) -> Void)? {
  pendingLock.lock()
  defer { pendingLock.unlock() }
  return pending.removeValue(forKey: token)
}

public class ReverieDragModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReverieDrag")

    // Null when JS could not build the file; the drop then fails on its own.
    Function("fulfill") { (token: String, uri: String?) in
      guard let done = takePending(token) else { return }
      guard let uri, let url = URL(string: uri) else {
        done(nil, false, NSError(domain: "ReverieDrag", code: 1))
        return
      }
      done(url, false, nil)
    }

    View(DragCardView.self) {
      Events("onMenuSelect", "onProvide")
      Prop("menu") { (view: DragCardView, menu: [[String: Any]]) in
        view.menuItems = menu
      }
      Prop("dragEnabled") { (view: DragCardView, enabled: Bool) in
        view.drag.isEnabled = enabled
        view.contextMenu.map { view.removeInteraction($0) }
        view.contextMenu = nil
        if enabled { view.addContextMenu() }
      }
      Prop("name") { (view: DragCardView, name: String) in
        view.name = name
      }
      Prop("cornerRadius") { (view: DragCardView, radius: Double) in
        view.radius = radius
      }
    }

    View(DropTargetView.self) {
      Events("onDropFiles")
    }
  }
}

class DragCardView: ExpoView, UIDragInteractionDelegate, UIContextMenuInteractionDelegate {
  let onMenuSelect = EventDispatcher()
  let onProvide = EventDispatcher()
  var menuItems: [[String: Any]] = []
  var name = "Character"
  var radius = 20.0
  lazy var drag = UIDragInteraction(delegate: self)
  var contextMenu: UIContextMenuInteraction?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // Off by default on the iPhone.
    drag.isEnabled = true
    addInteraction(drag)
    addContextMenu()
  }

  func addContextMenu() {
    let menu = UIContextMenuInteraction(delegate: self)
    addInteraction(menu)
    contextMenu = menu
  }

  private func dragItem() -> UIDragItem {
    let provider = NSItemProvider()
    provider.suggestedName = name
    // The archive first: Files keeps the first type it can, Photos only takes the picture.
    for (type, kind) in [(characterType, "archive"), (UTType.png.identifier, "card")] {
      provider.registerFileRepresentation(forTypeIdentifier: type, fileOptions: [], visibility: .all) { [weak self] done in
        let token = UUID().uuidString
        pendingLock.lock()
        pending[token] = done
        pendingLock.unlock()
        DispatchQueue.main.async {
          guard let self else {
            takePending(token)?(nil, false, NSError(domain: "ReverieDrag", code: 2))
            return
          }
          self.onProvide(["token": token, "kind": kind])
        }
        return nil
      }
    }
    let item = UIDragItem(itemProvider: provider)
    item.localObject = self
    return item
  }

  private func roundedPreview() -> UITargetedPreview {
    let params = UIPreviewParameters()
    params.visiblePath = UIBezierPath(roundedRect: bounds, cornerRadius: radius)
    return UITargetedPreview(view: self, parameters: params)
  }

  func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
    session.localContext = window
    return [dragItem()]
  }

  // A tap on another card while one is in the air adds it to the stack.
  func dragInteraction(_ interaction: UIDragInteraction, itemsForAddingTo session: UIDragSession, withTouchAt point: CGPoint) -> [UIDragItem] {
    if session.items.contains(where: { $0.localObject as? DragCardView === self }) { return [] }
    return [dragItem()]
  }

  func dragInteraction(_ interaction: UIDragInteraction, previewForLifting item: UIDragItem, session: UIDragSession) -> UITargetedDragPreview? {
    let params = UIDragPreviewParameters()
    params.visiblePath = UIBezierPath(roundedRect: bounds, cornerRadius: radius)
    return UITargetedDragPreview(view: self, parameters: params)
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
    if menuItems.isEmpty { return nil }
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      guard let self else { return nil }
      return UIMenu(children: self.buildMenu(self.menuItems, path: []))
    }
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? {
    roundedPreview()
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? {
    roundedPreview()
  }

  private func buildMenu(_ items: [[String: Any]], path: [Int]) -> [UIMenuElement] {
    items.enumerated().map { index, entry in
      let title = entry["label"] as? String ?? ""
      let image = (entry["systemImage"] as? String).flatMap { UIImage(systemName: $0) }
      if let children = entry["children"] as? [[String: Any]] {
        return UIMenu(title: title, image: image, children: buildMenu(children, path: path + [index]))
      }
      let action = UIAction(title: title, image: image) { [weak self] _ in
        self?.onMenuSelect(["path": path + [index]])
      }
      if entry["destructive"] as? Bool == true { action.attributes = .destructive }
      return action
    }
  }
}

// The whole list as a drop target: a character archive, a backup or a card PNG from another
// app is copied into the caches and handed to JS, which shows the import sheet.
class DropTargetView: ExpoView, UIDropInteractionDelegate {
  let onDropFiles = EventDispatcher()
  private let accepted = [characterType, UTType.zip.identifier, UTType.png.identifier]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIDropInteraction(delegate: self))
  }

  // A card dragged within this same window is being moved around, not imported.
  private func fromHere(_ session: UIDropSession) -> Bool {
    (session.localDragSession?.localContext as? UIWindow) === window && window != nil
  }

  func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession) -> Bool {
    !fromHere(session) && session.hasItemsConforming(toTypeIdentifiers: accepted)
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: UIDropSession) -> UIDropProposal {
    UIDropProposal(operation: fromHere(session) ? .cancel : .copy)
  }

  func dropInteraction(_ interaction: UIDropInteraction, performDrop session: UIDropSession) {
    let group = DispatchGroup()
    var files: [[String: String]] = []
    let lock = NSLock()
    for item in session.items {
      let provider = item.itemProvider
      guard let type = accepted.first(where: { provider.hasItemConformingToTypeIdentifier($0) }) else { continue }
      group.enter()
      // The file handed over is gone once the block returns, so it is copied out first.
      provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
        defer { group.leave() }
        guard let url else { return }
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString)-\(url.lastPathComponent)")
        guard (try? FileManager.default.copyItem(at: url, to: copy)) != nil else { return }
        lock.lock()
        files.append(["uri": copy.absoluteString, "kind": type == UTType.png.identifier ? "card" : "archive"])
        lock.unlock()
      }
    }
    group.notify(queue: .main) { [weak self] in
      if !files.isEmpty { self?.onDropFiles(["files": files]) }
    }
  }
}
