import ExpoModulesCore
import UIKit

// A round glass button that asks before it acts, as Photos asks before deleting a photo: an
// action sheet given the button as its source, which iOS 26 opens out of the button itself, a
// line of what will happen over the destructive button, and closes back into it. The cancel
// button shows only where the sheet still stands at the bottom of the screen.
public class ReverieConfirmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReverieConfirm")

    View(ConfirmButtonView.self) {
      Events("onConfirm")
      Prop("systemImage") { (view: ConfirmButtonView, name: String) in
        view.systemImage = name
      }
      Prop("iconColor") { (view: ConfirmButtonView, color: UIColor) in
        view.iconColor = color
      }
      // The app's own light or dark look, which the glass and the sheet take on whatever the
      // system's is.
      Prop("dark") { (view: ConfirmButtonView, dark: Bool) in
        view.overrideUserInterfaceStyle = dark ? .dark : .light
      }
      Prop("label") { (view: ConfirmButtonView, label: String) in
        view.button.accessibilityLabel = label
      }
      Prop("message") { (view: ConfirmButtonView, message: String) in
        view.message = message
      }
      Prop("action") { (view: ConfirmButtonView, action: String) in
        view.action = action
      }
      Prop("cancel") { (view: ConfirmButtonView, cancel: String) in
        view.cancel = cancel
      }
      // False when deleting is set not to ask: a tap acts at once.
      Prop("asks") { (view: ConfirmButtonView, asks: Bool) in
        view.asks = asks
      }
    }
  }
}

final class ConfirmButtonView: ExpoView {
  let onConfirm = EventDispatcher()
  let button = UIButton(type: .system)
  var message = ""
  var action = ""
  var cancel = ""
  var asks = true
  var systemImage = "trash" {
    didSet { restyle() }
  }
  var iconColor = UIColor.label {
    didSet { restyle() }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    button.addAction(UIAction { [weak self] _ in self?.tapped() }, for: .primaryActionTriggered)
    addSubview(button)
    restyle()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
  }

  // The glass of the app's other round buttons, the symbol at the size they draw theirs.
  private func restyle() {
    var config: UIButton.Configuration
    if #available(iOS 26.0, *) {
      config = .glass()
    } else {
      config = .plain()
    }
    config.image = UIImage(systemName: systemImage)
    config.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 19)
    config.baseForegroundColor = iconColor
    config.cornerStyle = .capsule
    config.contentInsets = .zero
    button.configuration = config
  }

  private func tapped() {
    guard asks else {
      onConfirm()
      return
    }
    let sheet = UIAlertController(title: nil, message: message, preferredStyle: .actionSheet)
    sheet.addAction(UIAlertAction(title: action, style: .destructive) { [weak self] _ in
      self?.onConfirm()
    })
    sheet.addAction(UIAlertAction(title: cancel, style: .cancel))
    sheet.overrideUserInterfaceStyle = overrideUserInterfaceStyle
    sheet.popoverPresentationController?.sourceItem = button
    appContext?.utilities?.currentViewController()?.present(sheet, animated: true)
  }
}
