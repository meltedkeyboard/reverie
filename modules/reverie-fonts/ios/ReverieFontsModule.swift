import ExpoModulesCore
import UIKit

// React Native can draw any installed family by name, but has no call to list them.
public class ReverieFontsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReverieFonts")

    Function("families") { () -> [String] in
      UIFont.familyNames.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }
  }
}
