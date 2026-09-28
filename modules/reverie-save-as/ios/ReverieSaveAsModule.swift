import ExpoModulesCore
import UIKit

// The sheet Files shows for "Save to Files": a folder to pick and the name to save under,
// both chosen by the user. Expo only has pickers for opening, so it is shown from here.
public class ReverieSaveAsModule: Module {
  private var sheet: SaveAsSheet?

  public func definition() -> ModuleDefinition {
    Name("ReverieSaveAs")

    // Resolves to where the copy went, or null when the sheet is closed without saving.
    AsyncFunction("saveAs") { (fileUri: URL, promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("E_NO_VIEW_CONTROLLER", "Nothing to show the save sheet over")
        return
      }
      if self.sheet != nil {
        promise.reject("E_IN_PROGRESS", "The save sheet is already open")
        return
      }
      let sheet = SaveAsSheet { [weak self] saved in
        self?.sheet = nil
        guard let saved else {
          promise.resolve(nil)
          return
        }
        promise.resolve([
          "name": saved.lastPathComponent,
          "folder": saved.deletingLastPathComponent().lastPathComponent,
        ])
      }
      self.sheet = sheet
      sheet.present(fileUri, over: presenter)
    }.runOnQueue(.main)
  }
}

private class SaveAsSheet: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private let done: (URL?) -> Void
  private var finished = false

  init(done: @escaping (URL?) -> Void) {
    self.done = done
  }

  // asCopy leaves the source file alone, so the caller can delete it right after.
  func present(_ file: URL, over presenter: UIViewController) {
    let controller = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
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
    finish(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(nil)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish(nil)
  }
}
