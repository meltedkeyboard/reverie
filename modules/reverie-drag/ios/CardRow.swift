import ExpoModulesCore
import ExpoUI
import ImageIO
import SwiftUI
import UIKit

// A row of the system list (a SwiftUI List of @expo/ui) that behaves as a character's card
// did: the system's menu on a long press, the row lifted into a drag by moving the finger,
// a tap on other rows adding them to the stack, other characters dropped on it. SwiftUI has
// no way to add to a drag in the air, so the row's view finds the cell of the list it sits
// in (a UICollectionViewCell since iOS 16) and the UIKit interactions go on that cell.
let cardRowType = "reverieCardRow"

func registerCardRow() {
  ViewModifierRegistry.register(cardRowType) { params, _, dispatcher in
    CardRowModifier(config: CardRowConfig(params: params, dispatcher: dispatcher))
  }
}

func unregisterCardRow() {
  ViewModifierRegistry.unregister(cardRowType)
}

struct CardRowConfig {
  var items: [(id: Int, name: String)] = []
  var menu: [[String: Any]] = []
  // Off while the list is edited: neither the menu nor the drag, nor a drop.
  var enabled = true
  var acceptsCards = false
  var groupIds = Set<Int>()
  var accent = UIColor.systemBlue
  var shade = UIColor.black
  let dispatcher: EventDispatcher

  init(params: [String: Any], dispatcher: EventDispatcher) {
    self.dispatcher = dispatcher
    items = (params["items"] as? [[String: Any]] ?? []).compactMap { entry in
      guard let id = (entry["id"] as? NSNumber)?.intValue else { return nil }
      return (id, entry["name"] as? String ?? "Character")
    }
    menu = params["menu"] as? [[String: Any]] ?? []
    enabled = params["enabled"] as? Bool ?? true
    acceptsCards = params["acceptsCards"] as? Bool ?? false
    groupIds = Set((params["groupIds"] as? [NSNumber] ?? []).map { $0.intValue })
    if let hex = params["accentColor"] as? String { accent = UIColor(hex: hex) }
    if let hex = params["shadeColor"] as? String { shade = UIColor(hex: hex) }
  }

  // Everything goes to JS under the modifier's own name, which is how @expo/ui finds the
  // listener of a modifier; `event` tells them apart.
  func send(_ event: String, _ payload: [String: Any] = [:]) {
    dispatcher([cardRowType: payload.merging(["event": event]) { a, _ in a }])
  }
}

struct CardRowModifier: ViewModifier {
  let config: CardRowConfig

  func body(content: Content) -> some View {
    content.background(CardRowAnchor(config: config))
  }
}

private struct CardRowAnchor: UIViewRepresentable {
  let config: CardRowConfig

  func makeUIView(context: Context) -> CardRowAnchorView {
    let view = CardRowAnchorView()
    view.config = config
    return view
  }

  func updateUIView(_ view: CardRowAnchorView, context: Context) {
    view.config = config
  }

  static func dismantleUIView(_ view: CardRowAnchorView, coordinator: ()) {
    view.detach()
  }
}

// An empty view behind the row, there only to find the row's cell and to say what is in it.
final class CardRowAnchorView: UIView {
  var config: CardRowConfig? {
    didSet { if behavior?.owner === self { behavior?.refresh() } }
  }
  private weak var behavior: CardRowBehavior?

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) { fatalError() }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else { return }
    attach()
    // The row's view can be in the window a moment before the list has put it in its cell.
    if behavior == nil {
      DispatchQueue.main.async { [weak self] in self?.attach() }
    }
  }

  // The menu goes with the row, should the row leave the screen while it is up.
  override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    if newWindow == nil, behavior?.owner === self { behavior?.contextMenu.dismissMenu() }
  }

  private func attach() {
    guard window != nil, let cell = enclosingCell() else { return }
    // A cell the list hands to another row binds to that row's view: the last one wins.
    let found = CardRowBehavior.of(cell)
    if found !== behavior { behavior?.unbind(self) }
    behavior = found
    found.bind(self)
  }

  func detach() {
    behavior?.unbind(self)
    behavior = nil
  }

  private func enclosingCell() -> UIView? {
    var view = superview
    while let current = view {
      if current is UICollectionViewCell || current is UITableViewCell { return current }
      view = current.superview
    }
    return nil
  }
}

private var behaviorKey: UInt8 = 0

// Corners of the row lifted into a menu or a drag; in the list itself it has none.
private let LIFT_RADIUS: CGFloat = 16

// The interactions of one cell, kept on the cell for the rows that come to be shown in it.
final class CardRowBehavior: NSObject, PickableCard, UIDragInteractionDelegate, UIContextMenuInteractionDelegate, UIDropInteractionDelegate {
  private weak var cell: UIView?
  fileprivate weak var owner: CardRowAnchorView?
  private lazy var drag = UIDragInteraction(delegate: self)
  fileprivate lazy var contextMenu = UIContextMenuInteraction(delegate: self)
  // Over the row: the screen's background to dim it while it is in the air, the accent to
  // light it up while a drop is over it.
  private let shade = UIView()
  private var picked = false
  private var inDrag = false
  private var targeted = false

  static func of(_ cell: UIView) -> CardRowBehavior {
    if let found = objc_getAssociatedObject(cell, &behaviorKey) as? CardRowBehavior { return found }
    let made = CardRowBehavior(cell: cell)
    objc_setAssociatedObject(cell, &behaviorKey, made, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    return made
  }

  private init(cell: UIView) {
    self.cell = cell
    super.init()
    // Off by default on the iPhone.
    drag.isEnabled = true
    cell.addInteraction(drag)
    cell.addInteraction(contextMenu)
    cell.addInteraction(UIDropInteraction(delegate: self))
    shade.isUserInteractionEnabled = false
    shade.alpha = 0
    shade.frame = cell.bounds
    shade.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cell.addSubview(shade)
  }

  private var config: CardRowConfig? { owner?.config }

  func bind(_ anchor: CardRowAnchorView) {
    owner = anchor
    picked = false
    inDrag = false
    targeted = false
    refresh()
    restyle()
  }

  func unbind(_ anchor: CardRowAnchorView) {
    guard owner === anchor else { return }
    owner = nil
    refresh()
  }

  func refresh() {
    drag.isEnabled = config?.enabled ?? false
  }

  private func restyle() {
    guard let cell else { return }
    cell.bringSubviewToFront(shade)
    let lit = targeted
    UIView.animate(withDuration: 0.2, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
      if lit {
        self.shade.backgroundColor = self.config?.accent ?? .systemBlue
        self.shade.alpha = 0.16
      } else {
        self.shade.backgroundColor = self.config?.shade ?? .black
        self.shade.alpha = self.picked ? 0.55 : 0
      }
    }
  }

  func setPicked(_ on: Bool) {
    inDrag = on
    picked = on
    restyle()
  }

  // Added to the stack by a tap: dimmed once the lift has played, as a card is.
  private func pickAfterLift() {
    inDrag = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
      guard let self, self.inDrag else { return }
      self.picked = true
      self.restyle()
    }
  }

  private func dragItems() -> [UIDragItem] {
    guard let config else { return [] }
    let withGroup = config.items.count > 1
    return config.items.map { entry in
      characterDragItem(id: entry.id, name: entry.name, card: self, withGroup: withGroup) { [weak self] token, kind, id in
        self?.config?.send("provide", ["token": token, "kind": kind, "id": id])
      }
    }
  }

  private func liftPath() -> UIBezierPath {
    UIBezierPath(roundedRect: cell?.bounds ?? .zero, cornerRadius: LIFT_RADIUS)
  }

  private func preview() -> UITargetedPreview? {
    guard let cell, cell.window != nil else { return nil }
    let params = UIPreviewParameters()
    params.visiblePath = liftPath()
    return UITargetedPreview(view: cell, parameters: params)
  }

  // MARK: Drag

  func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
    guard config?.enabled == true else { return [] }
    session.localContext = cell?.window
    return dragItems()
  }

  func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) {
    for item in session.items {
      (item.localObject as? DragPayload)?.card?.setPicked(true)
    }
    config?.send("dragState", ["active": true])
  }

  // Only the row the drag began on hears its end, so it lights up all the others.
  func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) {
    for item in session.items {
      (item.localObject as? DragPayload)?.card?.setPicked(false)
    }
    setPicked(false)
    config?.send("dragState", ["active": false])
  }

  func dragInteraction(_ interaction: UIDragInteraction, itemsForAddingTo session: UIDragSession, withTouchAt point: CGPoint) -> [UIDragItem] {
    guard config?.enabled == true else { return [] }
    if session.items.contains(where: { ($0.localObject as? DragPayload)?.card === self }) { return [] }
    pickAfterLift()
    return dragItems()
  }

  func dragInteraction(_ interaction: UIDragInteraction, previewForLifting item: UIDragItem, session: UIDragSession) -> UITargetedDragPreview? {
    guard let cell else { return nil }
    let params = UIDragPreviewParameters()
    params.visiblePath = liftPath()
    return UITargetedDragPreview(view: cell, parameters: params)
  }

  // MARK: Menu

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
    guard let config, config.enabled, !config.menu.isEmpty else { return nil }
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      UIMenu(children: buildCardMenu(config.menu) { path in self?.config?.send("menu", ["path": path]) })
    }
  }

  // The touch that opened the menu must not then open the row in JS.
  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willDisplayMenuFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
    config?.send("menuState", ["open": true])
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
    // The row may be handed to another character by the time the menu has gone.
    let shown = self.config
    if let animator {
      animator.addCompletion { shown?.send("menuState", ["open": false]) }
    } else {
      shown?.send("menuState", ["open": false])
    }
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? {
    preview()
  }

  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? {
    preview()
  }

  // MARK: Drop

  // Other characters of this window dropped on this row. A row is no target for itself
  // alone, nor for the members of its own group.
  private func takes(_ session: UIDropSession) -> Bool {
    guard let config, config.enabled, config.acceptsCards, let local = session.localDragSession,
          (local.localContext as? UIWindow) === cell?.window else { return false }
    let own = Set(config.items.map { $0.id }).union(config.groupIds)
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
    config?.send("drop", ["ids": draggedIds(session)])
  }
}

// MARK: - Avatars of the rows

// The picture at the start of a row, as the list shows it: a face in a circle, or up to three
// of a group's, overlapping as a group's in Messages. Drawn once at the row's size and kept in
// the caches, since the list's Image reads its file whole each time it draws.
struct RowFace {
  let uri: String?
  let letter: String
  let tint: String
}

func rowAvatar(faces: [RowFace], side: Double, scale: Double, ring: String) throws -> String {
  let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("row-avatars", isDirectory: true)
  try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  // A new picture of the same name is still told apart by its date.
  let described = faces.map { face -> String in
    let date = face.uri.flatMap { URL(string: $0) }.flatMap { try? FileManager.default.attributesOfItem(atPath: $0.path)[.modificationDate] as? Date }
    return "\(face.uri ?? "")|\(date?.timeIntervalSince1970 ?? 0)|\(face.letter)|\(face.tint)"
  }.joined(separator: ";") + "|\(side)|\(scale)|\(ring)"
  let file = dir.appendingPathComponent("\(stableHash(described)).png")
  if FileManager.default.fileExists(atPath: file.path) { return file.absoluteString }

  let size = CGFloat(side)
  let format = UIGraphicsImageRendererFormat()
  format.scale = CGFloat(scale)
  format.opaque = false
  let ringColor = UIColor(hex: ring)
  let png = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: format).pngData { ctx in
    let rects = faceRects(count: min(faces.count, 3), side: size)
    for (index, face) in faces.prefix(3).enumerated() {
      let rect = rects[index]
      // A face over another stands off it by a thin ring of the screen's background.
      if index > 0 {
        ringColor.setFill()
        UIBezierPath(ovalIn: rect.insetBy(dx: -size * 0.03, dy: -size * 0.03)).fill()
      }
      ctx.cgContext.saveGState()
      UIBezierPath(ovalIn: rect).addClip()
      if let image = face.uri.flatMap({ loadImage($0, side: rect.width * CGFloat(scale)) }) {
        image.draw(in: aspectFill(image.size, in: rect))
      } else {
        UIColor(hex: face.tint).setFill()
        ctx.fill(rect)
        let font = UIFont(name: "Georgia", size: rect.width * 0.42) ?? .systemFont(ofSize: rect.width * 0.42)
        let text = NSAttributedString(string: face.letter, attributes: [.font: font, .foregroundColor: UIColor(white: 1, alpha: 0.85)])
        let box = text.size()
        text.draw(at: CGPoint(x: rect.midX - box.width / 2, y: rect.midY - box.height / 2))
      }
      ctx.cgContext.restoreGState()
    }
  }
  try png.write(to: file, options: .atomic)
  return file.absoluteString
}

private func faceRects(count: Int, side: CGFloat) -> [CGRect] {
  switch count {
  case 2:
    let d = side * 0.66
    return [CGRect(x: 0, y: 0, width: d, height: d), CGRect(x: side - d, y: side - d, width: d, height: d)]
  case 3:
    let d = side * 0.56
    return [
      CGRect(x: (side - d) / 2, y: 0, width: d, height: d),
      CGRect(x: 0, y: side - d, width: d, height: d),
      CGRect(x: side - d, y: side - d, width: d, height: d),
    ]
  default:
    return [CGRect(x: 0, y: 0, width: side, height: side)]
  }
}

private func aspectFill(_ size: CGSize, in rect: CGRect) -> CGRect {
  guard size.width > 0, size.height > 0 else { return rect }
  let scale = max(rect.width / size.width, rect.height / size.height)
  let fitted = CGSize(width: size.width * scale, height: size.height * scale)
  return CGRect(x: rect.midX - fitted.width / 2, y: rect.midY - fitted.height / 2, width: fitted.width, height: fitted.height)
}

// Decoded straight at about the size it is drawn at, its shorter side covering `side` pixels.
private func loadImage(_ uri: String, side: CGFloat) -> UIImage? {
  guard let url = URL(string: uri), let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
  var longest = side
  if let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
     let w = (props[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
     let h = (props[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue, min(w, h) > 0 {
    longest = side * CGFloat(max(w, h) / min(w, h))
  }
  let options: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: Int(ceil(longest)),
  ]
  guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
  return UIImage(cgImage: cg)
}

// FNV-1a: the same name for the same picture from one launch to the next, which Swift's own
// hashing does not give.
private func stableHash(_ text: String) -> String {
  var hash: UInt64 = 0xcbf29ce484222325
  for byte in text.utf8 {
    hash ^= UInt64(byte)
    hash = hash &* 0x100000001b3
  }
  return String(hash, radix: 16)
}
