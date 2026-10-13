import UIKit

class ReverieSplashContainerView: UIView {
  var onTraitCollectionChange: ((UITraitCollection) -> Void)?

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    onTraitCollectionChange?(traitCollection)
  }
}

public class ReverieSplashManager: NSObject {
  @objc public static let shared = ReverieSplashManager()

  private var splashView: ReverieSplashContainerView?
  private var iconView: UIImageView?
  private var wordmarkView: UIImageView?

  private var isAttached = false
  private var isDismissing = false
  public var isFinished = false
  public var onFinished: (() -> Void)?

  private override init() {
    super.init()
  }

  public func attach(to rootView: UIView) {
    if Thread.isMainThread {
      setupView(on: rootView)
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.setupView(on: rootView)
      }
    }
  }

  private func setupView(on rootView: UIView) {
    guard !isAttached, !isFinished else { return }
    isAttached = true

    let container = ReverieSplashContainerView(frame: rootView.bounds)
    container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    container.backgroundColor = UIColor { traitCollection in
      traitCollection.userInterfaceStyle == .dark
        ? UIColor(red: 15.0 / 255.0, green: 15.0 / 255.0, blue: 18.0 / 255.0, alpha: 1.0)
        : UIColor(red: 245.0 / 255.0, green: 245.0 / 255.0, blue: 247.0 / 255.0, alpha: 1.0)
    }

    let icon = UIImageView()
    icon.translatesAutoresizingMaskIntoConstraints = false
    icon.contentMode = .scaleAspectFit
    icon.image = loadIconImage(for: container.traitCollection)

    container.onTraitCollectionChange = { [weak self, weak icon] traitCollection in
      icon?.image = self?.loadIconImage(for: traitCollection)
    }

    let wordmark = UIImageView()
    wordmark.translatesAutoresizingMaskIntoConstraints = false
    wordmark.contentMode = .scaleAspectFit
    wordmark.image = loadImage(named: "wordmark")

    // The spark in wordmark.svg sits to the left of the letters, so the optical center
    // sits about 3 points to the left of the geometric midpoint.
    let opticalShiftX: CGFloat = -2.99

    container.addSubview(icon)
    container.addSubview(wordmark)
    rootView.addSubview(container)
    rootView.bringSubviewToFront(container)

    NSLayoutConstraint.activate([
      icon.centerXAnchor.constraint(equalTo: container.centerXAnchor),
      icon.centerYAnchor.constraint(equalTo: container.centerYAnchor),
      icon.widthAnchor.constraint(equalToConstant: 120),
      icon.heightAnchor.constraint(equalToConstant: 120),

      wordmark.centerXAnchor.constraint(equalTo: container.centerXAnchor, constant: opticalShiftX),
      wordmark.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor, constant: -28),
      wordmark.widthAnchor.constraint(equalToConstant: 92),
      wordmark.heightAnchor.constraint(equalToConstant: 17.36),
    ])

    wordmark.alpha = 0.0
    wordmark.transform = CGAffineTransform(translationX: 0, y: 6)

    self.splashView = container
    self.iconView = icon
    self.wordmarkView = wordmark

    // Wordmark entrance animation matches Easing.out(Easing.cubic) over 200ms.
    UIView.animate(withDuration: 0.2, delay: 0.05, options: [.curveEaseOut]) {
      wordmark.alpha = 1.0
      wordmark.transform = .identity
    }

    // Fallback timer ensures the overlay never blocks the user if JS startup fails.
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
      self?.dismiss()
    }
  }

  public func dismiss(completion: (() -> Void)? = nil) {
    if !Thread.isMainThread {
      DispatchQueue.main.async { [weak self] in
        self?.dismiss(completion: completion)
      }
      return
    }

    guard !isDismissing, let container = self.splashView else {
      completion?()
      return
    }
    isDismissing = true

    // Exit animation: 350ms hold, then 200ms fade-out with a slight icon scale.
    UIView.animate(withDuration: 0.2, delay: 0.35, options: [.curveEaseOut], animations: {
      container.alpha = 0.0
      self.iconView?.transform = CGAffineTransform(scaleX: 1.12, y: 1.12)
    }, completion: { [weak self] _ in
      container.removeFromSuperview()
      self?.splashView = nil
      self?.isFinished = true
      self?.onFinished?()
      completion?()
    })
  }

  private func loadIconImage(for traitCollection: UITraitCollection) -> UIImage? {
    let name = traitCollection.userInterfaceStyle == .dark ? "splash-icon-dark" : "splash-icon"
    return loadImage(named: name)
  }

  private func loadImage(named name: String) -> UIImage? {
    let moduleBundle = Bundle(for: ReverieSplashManager.self)

    // Check module resource bundle first when integrated as a framework pod.
    if let resourceUrl = moduleBundle.url(forResource: "ReverieSplash", withExtension: "bundle"),
       let resourceBundle = Bundle(url: resourceUrl),
       let image = UIImage(named: name, in: resourceBundle, compatibleWith: nil) {
      return image
    }

    // Check direct framework bundle.
    if let image = UIImage(named: name, in: moduleBundle, compatibleWith: nil) {
      return image
    }

    // Check main app bundle for assets copied directly.
    if let image = UIImage(named: name) {
      return image
    }

    if let path = Bundle.main.path(forResource: name, ofType: "png"),
       let image = UIImage(contentsOfFile: path) {
      return image
    }

    return nil
  }
}
