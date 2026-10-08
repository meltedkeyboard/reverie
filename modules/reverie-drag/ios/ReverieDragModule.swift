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

    // The picture of a card for a character without an avatar: the initial on its tint, as
    // the app draws it. A file URL of a PNG in the caches.
    Function("renderInitial") { (letter: String, tint: String, size: Double) -> String in
      let side = CGSize(width: size, height: size)
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      let png = UIGraphicsImageRenderer(size: side, format: format).pngData { ctx in
        UIColor(hex: tint).setFill()
        ctx.fill(CGRect(origin: .zero, size: side))
        let font = UIFont(name: "Georgia", size: size * 0.42) ?? .systemFont(ofSize: size * 0.42)
        let text = NSAttributedString(string: letter, attributes: [.font: font, .foregroundColor: UIColor(white: 1, alpha: 0.85)])
        let box = text.size()
        text.draw(at: CGPoint(x: (size - box.width) / 2, y: (size - box.height) / 2))
      }
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).png")
      try png.write(to: url)
      return url.absoluteString
    }

    View(DragCardView.self) {
      Events("onMenuSelect", "onProvide", "onDragState", "onDropCards")
      Prop("menu") { (view: DragCardView, menu: [[String: Any]]) in
        view.menuItems = menu
      }
      Prop("dragEnabled") { (view: DragCardView, enabled: Bool) in
        view.drag.isEnabled = enabled
        view.contextMenu.map { view.removeInteraction($0) }
        view.contextMenu = nil
        if enabled { view.addContextMenu() }
      }
      // What the card carries when dragged: one character, or every member of a group.
      Prop("items") { (view: DragCardView, items: [[String: Any]]) in
        view.items = items.compactMap { entry in
          guard let id = entry["id"] as? Int else { return nil }
          return (id, entry["name"] as? String ?? "Character")
        }
      }
      // Whether other cards dropped on this one are taken: onto a character they make a
      // group, onto a group they join it.
      Prop("acceptsCards") { (view: DragCardView, accepts: Bool) in
        view.acceptsCards = accepts
      }
      Prop("accentColor") { (view: DragCardView, color: String) in
        view.accent = UIColor(hex: color)
      }
      Prop("cornerRadius") { (view: DragCardView, radius: Double) in
        view.radius = radius
      }
    }

    View(DropTargetView.self) {
      Events("onDropFiles", "onDropCards")
      // Characters in a group: dropped on the list off any card, they leave it.
      Prop("groupedIds") { (view: DropTargetView, ids: [Int]) in
        view.groupedIds = Set(ids)
      }
    }
  }
}

// One dragged character, and the card it was lifted from.
final class DragPayload {
  let id: Int
  weak var card: DragCardView?

  init(id: Int, card: DragCardView) {
    self.id = id
    self.card = card
  }
}

// The ids of the characters in a session started in this app.
func draggedIds(_ session: UIDropSession) -> [Int] {
  session.localDragSession?.items.compactMap { ($0.localObject as? DragPayload)?.id } ?? []
}

class DragCardView: ExpoView, UIDragInteractionDelegate, UIContextMenuInteractionDelegate, UIDropInteractionDelegate {
  let onMenuSelect = EventDispatcher()
  let onProvide = EventDispatcher()
  let onDragState = EventDispatcher()
  let onDropCards = EventDispatcher()
  var menuItems: [[String: Any]] = []
  var items: [(id: Int, name: String)] = []
  var acceptsCards = false
  var accent = UIColor.systemBlue
  var radius = 20.0
  lazy var drag = UIDragInteraction(delegate: self)
  var contextMenu: UIContextMenuInteraction?
  private let ring = UIView()
  // Lifted into a drag: dimmed where it stood until the drag ends.
  private var picked = false
  private var targeted = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // Off by default on the iPhone.
    drag.isEnabled = true
    addInteraction(drag)
    addContextMenu()
    addInteraction(UIDropInteraction(delegate: self))
    ring.isUserInteractionEnabled = false
    ring.alpha = 0
    ring.layer.borderWidth = 2.5
    ring.layer.cornerCurve = .continuous
    addSubview(ring)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    ring.frame = bounds
    ring.layer.cornerRadius = radius
    bringSubviewToFront(ring)
  }

  // The target ring shows on a dimmed card too: the card lights up again under it.
  private func restyle() {
    ring.layer.borderColor = accent.cgColor
    ring.backgroundColor = accent.withAlphaComponent(0.12)
    UIView.animate(withDuration: 0.35, delay: 0, usingSpringWithDamping: 0.75, initialSpringVelocity: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
      self.alpha = self.picked && !self.targeted ? 0.45 : 1
      self.ring.alpha = self.targeted ? 1 : 0
      self.transform = self.targeted ? CGAffineTransform(scaleX: 1.03, y: 1.03) : .identity
    }
  }

  func setPicked(_ on: Bool) {
    picked = on
    restyle()
  }

  func addContextMenu() {
    let menu = UIContextMenuInteraction(delegate: self)
    addInteraction(menu)
    contextMenu = menu
  }

  private func dragItems() -> [UIDragItem] {
    items.map { dragItem(id: $0.id, name: $0.name) }
  }

  private func dragItem(id: Int, name: String) -> UIDragItem {
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
          self.onProvide(["token": token, "kind": kind, "id": id])
        }
        return nil
      }
    }
    let item = UIDragItem(itemProvider: provider)
    item.localObject = DragPayload(id: id, card: self)
    return item
  }

  private func roundedPreview() -> UITargetedPreview {
    let params = UIPreviewParameters()
    params.visiblePath = UIBezierPath(roundedRect: bounds, cornerRadius: radius)
    return UITargetedPreview(view: self, parameters: params)
  }

  func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
    session.localContext = window
    return dragItems()
  }

  func dragInteraction(_ interaction: UIDragInteraction, willAdd items: [UIDragItem], for session: UIDragSession, withAnimator animator: UIDragAnimating) {
    animator.addCompletion { _ in self.setPicked(true) }
  }

  // While cards are in the air a tap on another one adds it to the stack, so JS must not
  // open it as well.
  func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) {
    onDragState(["active": true])
  }

  // Only the card the drag began on hears its end, so it lights up all the others.
  func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) {
    for item in session.items {
      (item.localObject as? DragPayload)?.card?.setPicked(false)
    }
    setPicked(false)
    onDragState(["active": false])
  }

  // A tap on another card while one is in the air adds it to the stack.
  func dragInteraction(_ interaction: UIDragInteraction, itemsForAddingTo session: UIDragSession, withTouchAt point: CGPoint) -> [UIDragItem] {
    if session.items.contains(where: { ($0.localObject as? DragPayload)?.card === self }) { return [] }
    return dragItems()
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

  // Other cards of this window dropped on this one. A card is no target for itself alone.
  private func takes(_ session: UIDropSession) -> Bool {
    guard acceptsCards, let local = session.localDragSession, (local.localContext as? UIWindow) === window else { return false }
    let own = Set(items.map { $0.id })
    return draggedIds(session).contains { !own.contains($0) }
  }

  func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession) -> Bool {
    takes(session)
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnter session: UIDropSession) {
    targeted = true
    restyle()
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: UIDropSession) -> UIDropProposal {
    UIDropProposal(operation: takes(session) ? .move : .cancel)
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: UIDropSession) {
    targeted = false
    restyle()
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: UIDropSession) {
    targeted = false
    restyle()
  }

  func dropInteraction(_ interaction: UIDropInteraction, performDrop session: UIDropSession) {
    onDropCards(["ids": draggedIds(session)])
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
  let onDropCards = EventDispatcher()
  var groupedIds = Set<Int>()
  private let accepted = [characterType, UTType.zip.identifier, UTType.png.identifier]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIDropInteraction(delegate: self))
  }

  // A card dragged within this same window is being moved around, not imported.
  private func fromHere(_ session: UIDropSession) -> Bool {
    (session.localDragSession?.localContext as? UIWindow) === window && window != nil
  }

  // From here only members of a group are taken, to leave it; anything else moved around
  // is no import.
  private func leavesGroup(_ session: UIDropSession) -> Bool {
    draggedIds(session).contains { groupedIds.contains($0) }
  }

  func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession) -> Bool {
    fromHere(session) ? leavesGroup(session) : session.hasItemsConforming(toTypeIdentifiers: accepted)
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: UIDropSession) -> UIDropProposal {
    if fromHere(session) { return UIDropProposal(operation: leavesGroup(session) ? .move : .cancel) }
    return UIDropProposal(operation: .copy)
  }

  func dropInteraction(_ interaction: UIDropInteraction, performDrop session: UIDropSession) {
    if fromHere(session) {
      onDropCards(["ids": draggedIds(session).filter { groupedIds.contains($0) }])
      return
    }
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

private extension UIColor {
  convenience init(hex: String) {
    let value = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
    self.init(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: 1
    )
  }
}
