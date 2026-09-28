import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

// A folder the user picked in Files (usually in iCloud Drive), remembered across launches
// with a bookmark. Apps get into such a folder through the document picker alone, so this
// needs no iCloud entitlement and works with an app signed by a free Apple ID.
//
// Every read and write goes through NSFileCoordinator: that is what makes iCloud Drive
// download a file that is only a placeholder on this device, and upload one once written.
// Paths from JS are relative to the sync folder, "" being the folder itself.
public class ReverieCloudFolderModule: Module {
  private static let bookmarkKey = "reverie.cloudFolder.bookmark"
  private static let subfolderKey = "reverie.cloudFolder.subfolder"
  // Created inside the picked folder, unless the picked folder already is one.
  private static let subfolderName = "Reverie Sync"
  private static let manifestName = "manifest.json"

  private let lock = NSLock()
  private var accessed: URL?
  private var picker: FolderPicker?

  public func definition() -> ModuleDefinition {
    Name("ReverieCloudFolder")

    // Resolves to the folder's name, or null when the picker is cancelled.
    AsyncFunction("pickFolder") { (promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("E_NO_VIEW_CONTROLLER", "Nothing to show the folder picker over")
        return
      }
      let picker = FolderPicker { [weak self] url in
        guard let self else { return }
        self.picker = nil
        guard let url else {
          promise.resolve(nil)
          return
        }
        do {
          promise.resolve(try self.remember(url))
        } catch {
          promise.reject(error)
        }
      }
      self.picker = picker
      picker.present(over: presenter)
    }.runOnQueue(.main)

    // The name of the remembered folder, or null when there is none or it is gone.
    Function("folderName") { () -> String? in
      guard let root = try? self.root() else { return nil }
      return self.displayName(root)
    }

    Function("forgetFolder") {
      self.lock.lock()
      defer { self.lock.unlock() }
      self.accessed?.stopAccessingSecurityScopedResource()
      self.accessed = nil
      UserDefaults.standard.removeObject(forKey: Self.bookmarkKey)
      UserDefaults.standard.removeObject(forKey: Self.subfolderKey)
    }

    // File names in a folder; files iCloud has not downloaded yet show under their own name.
    AsyncFunction("list") { (path: String) -> [String] in
      let url = try self.resolve(path)
      var names: [String] = []
      try self.coordinateReading(url) { real in
        guard FileManager.default.fileExists(atPath: real.path) else { return }
        for item in try FileManager.default.contentsOfDirectory(atPath: real.path) {
          if item.hasPrefix(".") && item.hasSuffix(".icloud") {
            names.append(String(item.dropFirst().dropLast(".icloud".count)))
          } else if !item.hasPrefix(".") {
            names.append(item)
          }
        }
      }
      return names
    }

    AsyncFunction("copyIn") { (path: String, localUri: URL) in
      let url = try self.resolve(path)
      try self.coordinateReading(url) { real in
        try self.replace(localUri, with: real)
      }
    }

    AsyncFunction("copyOut") { (localUri: URL, path: String) in
      let url = try self.resolve(path)
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try self.coordinateWriting(url, options: .forReplacing) { real in
        try self.replace(real, with: localUri)
      }
    }

    AsyncFunction("remove") { (path: String) in
      let url = try self.resolve(path)
      try self.coordinateWriting(url, options: .forDeleting) { real in
        if FileManager.default.fileExists(atPath: real.path) {
          try FileManager.default.removeItem(at: real)
        }
      }
    }
  }

  // Keeps the picked folder. When it holds no sync data yet, the data goes to a folder of
  // its own inside, so picking iCloud Drive itself does not litter it with files.
  private func remember(_ picked: URL) throws -> String {
    let bookmark = try picked.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
    let hasManifest = FileManager.default.fileExists(atPath: picked.appendingPathComponent(Self.manifestName).path)
      || FileManager.default.fileExists(atPath: picked.appendingPathComponent(".\(Self.manifestName).icloud").path)
    let subfolder = hasManifest ? "" : Self.subfolderName

    lock.lock()
    accessed?.stopAccessingSecurityScopedResource()
    accessed = picked
    UserDefaults.standard.set(bookmark, forKey: Self.bookmarkKey)
    UserDefaults.standard.set(subfolder, forKey: Self.subfolderKey)
    lock.unlock()

    let root = subfolder.isEmpty ? picked : picked.appendingPathComponent(subfolder, isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return displayName(root)
  }

  // The sync folder, with access started once per launch and kept until it is forgotten.
  private func root() throws -> URL {
    lock.lock()
    defer { lock.unlock() }
    if accessed == nil {
      guard let data = UserDefaults.standard.data(forKey: Self.bookmarkKey) else {
        throw Exception(name: "NoFolder", description: "No sync folder is chosen")
      }
      var stale = false
      let url = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
      guard url.startAccessingSecurityScopedResource() else {
        throw Exception(name: "FolderUnavailable", description: "The sync folder can no longer be opened")
      }
      // A folder that was moved or renamed still resolves, but the bookmark has to be redone.
      if stale, let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
        UserDefaults.standard.set(fresh, forKey: Self.bookmarkKey)
      }
      accessed = url
    }
    let subfolder = UserDefaults.standard.string(forKey: Self.subfolderKey) ?? ""
    return subfolder.isEmpty ? accessed! : accessed!.appendingPathComponent(subfolder, isDirectory: true)
  }

  private func resolve(_ path: String) throws -> URL {
    let root = try root()
    return path.isEmpty ? root : root.appendingPathComponent(path)
  }

  private func displayName(_ url: URL) -> String {
    (try? url.resourceValues(forKeys: [.localizedNameKey]).localizedName) ?? url.lastPathComponent
  }

  private func replace(_ target: URL, with source: URL) throws {
    let fm = FileManager.default
    if fm.fileExists(atPath: target.path) {
      try fm.removeItem(at: target)
    }
    try fm.copyItem(at: source, to: target)
  }

  private func coordinateReading(_ url: URL, _ body: (URL) throws -> Void) throws {
    var coordinationError: NSError?
    var bodyError: Error?
    NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { real in
      do { try body(real) } catch { bodyError = error }
    }
    if let error = coordinationError ?? bodyError { throw error }
  }

  private func coordinateWriting(_ url: URL, options: NSFileCoordinator.WritingOptions, _ body: (URL) throws -> Void) throws {
    var coordinationError: NSError?
    var bodyError: Error?
    NSFileCoordinator().coordinate(writingItemAt: url, options: options, error: &coordinationError) { real in
      do { try body(real) } catch { bodyError = error }
    }
    if let error = coordinationError ?? bodyError { throw error }
  }
}

private class FolderPicker: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private let done: (URL?) -> Void
  private var finished = false

  init(done: @escaping (URL?) -> Void) {
    self.done = done
  }

  func present(over presenter: UIViewController) {
    let controller = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
    controller.delegate = self
    controller.presentationController?.delegate = self
    presenter.present(controller, animated: true)
  }

  private func finish(_ url: URL?) {
    if finished { return }
    finished = true
    done(url)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first, url.startAccessingSecurityScopedResource() else {
      finish(nil)
      return
    }
    finish(url)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(nil)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish(nil)
  }
}
