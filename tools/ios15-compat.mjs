import fs from 'fs'
import path from 'path'

// Patches all .podspec files across node_modules and modules to lower the minimum iOS requirement
// to 15.1 (the lowest version supported by React Native 0.88, which runs on iPhone 6s on iOS 15).
function patchPodspecsIn(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '.git') patchPodspecsIn(full)
    } else if (entry.isFile() && entry.name.endsWith('.podspec')) {
      const content = fs.readFileSync(full, 'utf8')
      const updated = content.replace(/(:\s*ios\s*=>\s*['"])(?:1[6-9]|[2-9][0-9])(?:\.[0-9]+)*(['"])/g, '$115.1$2')
      if (updated !== content) {
        fs.writeFileSync(full, updated, 'utf8')
        console.log(`[ios15-compat] Patched ${path.relative(process.cwd(), full)} -> iOS 15.1`)
      }
    }
  }
}

function replaceInFile(relPath, target, replacement, label) {
  const file = path.resolve(relPath)
  if (!fs.existsSync(file)) return
  let content = fs.readFileSync(file, 'utf8')
  if (content.includes(replacement)) return
  if (content.includes(target)) {
    content = content.replace(target, replacement)
    fs.writeFileSync(file, content, 'utf8')
    console.log(`[ios15-compat] Patched ${label || path.basename(file)}`)
  }
}

// Patch expo-screen-orientation: guard requestGeometryUpdate and setNeedsUpdateOfSupportedInterfaceOrientations
function patchScreenOrientation() {
  replaceInFile(
    'node_modules/expo-screen-orientation/ios/ScreenOrientationRegistry.swift',
    `      let windowScene = SceneGeometry.windowScene(for: self.rootViewController?.view)
      windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: orientationMask)) { error in
        #if DEBUG
        log.warn(
          "Couldn't lock the screen orientation because the system refused the request. This happens "
          + "when your app is resizable, such as iPad multitasking, iPhone Mirroring, or any app on "
          + "iOS 27 and later, where a supported orientation is only a preference. Design your screens "
          + "to adapt to the available space, or on iPad set \`ios.requireFullScreen\` to \`true\` in your "
          + "app config. See https://docs.expo.dev/versions/latest/sdk/screen-orientation/ "
          + "Underlying error: \\(error.localizedDescription)"
        )
        #endif
      }
      self.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()`,
    `      if #available(iOS 16.0, *) {
        let windowScene = SceneGeometry.windowScene(for: self.rootViewController?.view)
        windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: orientationMask)) { error in
          #if DEBUG
          log.warn(
            "Couldn't lock the screen orientation because the system refused the request. This happens "
            + "when your app is resizable, such as iPad multitasking, iPhone Mirroring, or any app on "
            + "iOS 27 and later, where a supported orientation is only a preference. Design your screens "
            + "to adapt to the available space, or on iPad set \`ios.requireFullScreen\` to \`true\` in your "
            + "app config. See https://docs.expo.dev/versions/latest/sdk/screen-orientation/ "
            + "Underlying error: \\(error.localizedDescription)"
          )
          #endif
        }
        self.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
      }`,
    'ScreenOrientationRegistry.swift'
  )
}

// Patch expo-video: guard requestGeometryUpdate
function patchExpoVideo() {
  replaceInFile(
    'node_modules/expo-video/ios/OrientationAVPlayerViewController.swift',
    `  private func forceRotationUpdate() {
    let windowScene = SceneGeometry.windowScene(for: view)
    windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: fullscreenOrientation))
  }`,
    `  private func forceRotationUpdate() {
    if #available(iOS 16.0, *) {
      let windowScene = SceneGeometry.windowScene(for: view)
      windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: fullscreenOrientation))
    }
  }`,
    'OrientationAVPlayerViewController.swift'
  )
}

// Patch expo-modules-core: guard SceneGeometry.effectiveGeometry
function patchSceneGeometry() {
  replaceInFile(
    'node_modules/expo-modules-core/ios/Utilities/SceneGeometry.swift',
    `  static func interfaceOrientation(for view: UIView? = nil) -> UIInterfaceOrientation {
    return windowScene(for: view)?.effectiveGeometry.interfaceOrientation ?? .unknown
  }`,
    `  static func interfaceOrientation(for view: UIView? = nil) -> UIInterfaceOrientation {
    if #available(iOS 16.0, *) {
      return windowScene(for: view)?.effectiveGeometry.interfaceOrientation ?? .unknown
    } else {
      return windowScene(for: view)?.interfaceOrientation ?? .unknown
    }
  }`,
    'SceneGeometry.swift'
  )
}

// Patch @expo/ui for iOS 15 compatibility
function patchExpoUI() {
  // NavigationLinkView
  replaceInFile(
    'node_modules/@expo/ui/ios/NavigationLinkView.swift',
    `  var body: some View {
    NavigationLink(value: props.value) {
      Children()
    }
  }`,
    `  var body: some View {
    if #available(iOS 16.0, *) {
      NavigationLink(value: props.value) {
        Children()
      }
    } else {
      NavigationLink(destination: Children()) {
        EmptyView()
      }
    }
  }`,
    'NavigationLinkView.swift'
  )

  // MenuOrderModifier
  replaceInFile(
    'node_modules/@expo/ui/ios/Modifiers/MenuOrderModifier.swift',
    `  func toNativeMenuOrder() -> SwiftUI.MenuOrder {`,
    `  @available(iOS 16.0, *)
  func toNativeMenuOrder() -> SwiftUI.MenuOrder {`,
    'MenuOrderModifier.swift (enum)'
  )
  replaceInFile(
    'node_modules/@expo/ui/ios/Modifiers/MenuOrderModifier.swift',
    `  func body(content: Content) -> some View {
    content.menuOrder(order.toNativeMenuOrder())
  }`,
    `  func body(content: Content) -> some View {
    if #available(iOS 16.0, *) {
      content.menuOrder(order.toNativeMenuOrder())
    } else {
      content
    }
  }`,
    'MenuOrderModifier.swift (body)'
  )

  // ListView
  replaceInFile(
    'node_modules/@expo/ui/ios/ListView.swift',
    `  var body: some View {
    list
      .onGeometryChange(for: CGFloat.self, of: { $0.size.width }, action: { crossAxisSize = $0 })
      .environment(\\.containerCrossAxisSize, crossAxisSize)
  }`,
    `  var body: some View {
    if #available(iOS 16.0, *) {
      list
        .onGeometryChange(for: CGFloat.self, of: { $0.size.width }, action: { crossAxisSize = $0 })
        .environment(\\.containerCrossAxisSize, crossAxisSize)
    } else {
      list
    }
  }`,
    'ListView.swift'
  )

  // LazyVStackView
  replaceInFile(
    'node_modules/@expo/ui/ios/LazyVStackView.swift',
    `  public var body: some View {
    LazyVStack(
      alignment: props.alignment?.toHorizontalAlignment() ?? .center,
      spacing: props.spacing.map { CGFloat($0) }) {
        Children()
    }
    .onGeometryChange(for: CGFloat.self, of: { $0.size.width }, action: { crossAxisSize = $0 })
    .environment(\\.containerCrossAxisSize, crossAxisSize)
  }`,
    `  public var body: some View {
    let stack = LazyVStack(
      alignment: props.alignment?.toHorizontalAlignment() ?? .center,
      spacing: props.spacing.map { CGFloat($0) }) {
        Children()
    }
    if #available(iOS 16.0, *) {
      stack
        .onGeometryChange(for: CGFloat.self, of: { $0.size.width }, action: { crossAxisSize = $0 })
        .environment(\\.containerCrossAxisSize, crossAxisSize)
    } else {
      stack
    }
  }`,
    'LazyVStackView.swift'
  )

  // LazyHStackView
  replaceInFile(
    'node_modules/@expo/ui/ios/LazyHStackView.swift',
    `  public var body: some View {
    LazyHStack(
      alignment: props.alignment?.toVerticalAlignment() ?? .center,
      spacing: props.spacing.map { CGFloat($0) }) {
        Children()
    }
    .onGeometryChange(for: CGFloat.self, of: { $0.size.height }, action: { crossAxisSize = $0 })
    .environment(\\.containerCrossAxisSize, crossAxisSize)
  }`,
    `  public var body: some View {
    let stack = LazyHStack(
      alignment: props.alignment?.toVerticalAlignment() ?? .center,
      spacing: props.spacing.map { CGFloat($0) }) {
        Children()
    }
    if #available(iOS 16.0, *) {
      stack
        .onGeometryChange(for: CGFloat.self, of: { $0.size.height }, action: { crossAxisSize = $0 })
        .environment(\\.containerCrossAxisSize, crossAxisSize)
    } else {
      stack
    }
  }`,
    'LazyHStackView.swift'
  )

  // HStackView
  replaceInFile(
    'node_modules/@expo/ui/ios/HStackView.swift',
    `  public var body: some View {
    if props.resolvesChildPercentages {`,
    `  public var body: some View {
    if #available(iOS 16.0, *), props.resolvesChildPercentages {`,
    'HStackView.swift'
  )

  // VStackView
  replaceInFile(
    'node_modules/@expo/ui/ios/VStackView.swift',
    `  public var body: some View {
    if props.resolvesChildPercentages {`,
    `  public var body: some View {
    if #available(iOS 16.0, *), props.resolvesChildPercentages {`,
    'VStackView.swift'
  )

  // DatePickerView
  replaceInFile(
    'node_modules/@expo/ui/ios/DatePickerView.swift',
    `  func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIDatePicker, context: Context) -> CGSize? {`,
    `  @available(iOS 16.0, *)
  func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIDatePicker, context: Context) -> CGSize? {`,
    'DatePickerView.swift'
  )

  // DataListForEachView
  replaceInFile(
    'node_modules/@expo/ui/ios/DataListForEachView.swift',
    `      if showsContent {
        // Measured in the background: \`onGeometryChange\` on the item hides its row traits from \`List\`.
        DataListForEachItemView(props: props)
          .id(itemKey)
          .background(
            Color.clear.onGeometryChange(
              for: CGFloat.self,
              of: { axis == .horizontal ? $0.size.width : $0.size.height },
              action: { size in window.measure(size, for: itemKey, revision: revision) }
            )
          )
      } else {`,
    `      if showsContent {
        if #available(iOS 16.0, *) {
          DataListForEachItemView(props: props)
            .id(itemKey)
            .background(
              Color.clear.onGeometryChange(
                for: CGFloat.self,
                of: { axis == .horizontal ? $0.size.width : $0.size.height },
                action: { size in window.measure(size, for: itemKey, revision: revision) }
              )
            )
        } else {
          DataListForEachItemView(props: props)
            .id(itemKey)
        }
      } else {`,
    'DataListForEachView.swift'
  )

  // BottomSheetView
  replaceInFile(
    'node_modules/@expo/ui/ios/BottomSheetView.swift',
    `  @ViewBuilder
  private var presentedContent: some View {
    if let background = props.children?.slot("presentationBackground") {
      sheetContent.presentationBackground { background }
    } else {
      sheetContent
    }
  }`,
    `  @ViewBuilder
  private var presentedContent: some View {
    if #available(iOS 16.4, *), let background = props.children?.slot("presentationBackground") {
      sheetContent.presentationBackground { background }
    } else {
      sheetContent
    }
  }`,
    'BottomSheetView.swift'
  )

  // OnGeometryChangeModifier
  replaceInFile(
    'node_modules/@expo/ui/ios/Modifiers/OnGeometryChangeModifier.swift',
    `  func body(content: Content) -> some View {
    content.onGeometryChange(for: CGRect.self, of: { proxy in proxy.frame(in: .global) }, action: {
      dispatch($0)
    })
  }`,
    `  func body(content: Content) -> some View {
    if #available(iOS 16.0, *) {
      content.onGeometryChange(for: CGRect.self, of: { proxy in proxy.frame(in: .global) }, action: {
        dispatch($0)
      })
    } else {
      content
    }
  }`,
    'OnGeometryChangeModifier.swift'
  )

  // NavigationStackView
  replaceInFile(
    'node_modules/@expo/ui/ios/NavigationStackView.swift',
    `  var body: some View {
    NavigationStack(path: pathBinding) {
      rootContent
        .navigationDestination(for: String.self) { value in
          NavigationDestinationContent(props: props, value: value)
        }
    }
  }`,
    `  var body: some View {
    if #available(iOS 16.0, *) {
      NavigationStack(path: pathBinding) {
        rootContent
          .navigationDestination(for: String.self) { value in
            NavigationDestinationContent(props: props, value: value)
          }
      }
    } else {
      NavigationView {
        rootContent
      }
    }
  }`,
    'NavigationStackView.swift'
  )

  // NavigationSplitViewView
  replaceInFile(
    'node_modules/@expo/ui/ios/NavigationSplitViewView.swift',
    `  @ViewBuilder
  var body: some View {
    if #available(iOS 17.0, tvOS 17.0, *) {`,
    `  @ViewBuilder
  var body: some View {
    if #available(iOS 16.0, *) {
      splitBody
    } else {
      EmptyView()
    }
  }

  @available(iOS 16.0, *)
  @ViewBuilder
  private var splitBody: some View {
    if #available(iOS 17.0, tvOS 17.0, *) {`,
    'NavigationSplitViewView.swift'
  )

  // NavigationModifiers
  replaceInFile(
    'node_modules/@expo/ui/ios/Modifiers/NavigationModifiers.swift',
    `  @ViewBuilder
  func body(content: Content) -> some View {
    switch style {
    case .automatic:
      content.navigationSplitViewStyle(.automatic)
    case .balanced:
      content.navigationSplitViewStyle(.balanced)
    case .prominentDetail:
      content.navigationSplitViewStyle(.prominentDetail)
    }
  }`,
    `  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 16.0, *) {
      switch style {
      case .automatic:
        content.navigationSplitViewStyle(.automatic)
      case .balanced:
        content.navigationSplitViewStyle(.balanced)
      case .prominentDetail:
        content.navigationSplitViewStyle(.prominentDetail)
      }
    } else {
      content
    }
  }`,
    'NavigationModifiers.swift (style)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/Modifiers/NavigationModifiers.swift',
    `  @ViewBuilder
  func body(content: Content) -> some View {
    if let width {
      content.navigationSplitViewColumnWidth(width)
    } else if let ideal {
      content.navigationSplitViewColumnWidth(min: min, ideal: ideal, max: max)
    } else {
      content
    }
  }`,
    `  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 16.0, *) {
      if let width {
        content.navigationSplitViewColumnWidth(width)
      } else if let ideal {
        content.navigationSplitViewColumnWidth(min: min, ideal: ideal, max: max)
      } else {
        content
      }
    } else {
      content
    }
  }`,
    'NavigationModifiers.swift (column width)'
  )

  // UIBaseView
  replaceInFile(
    'node_modules/@expo/ui/ios/UIBaseView.swift',
    `  public var body: some View {
    UniversalPercentageParentBoundary(content: innerView)
      .applyAccessibilityIdentifier(props.testID)
      .applyModifiers(props.modifiers, appContext: props.appContext, globalEventDispatcher: props.globalEventDispatcher)
      // A user modifier such as \`onGeometryChange\` hides the layout value a universal stack reads.
      // Set it again outside every modifier.
      .layoutValue(key: UniversalLayoutDimensionsKey.self, value: universalLayoutDimensions(from: props.modifiers))
      .publishZeroContentOrigin(props.shadowNodeProxy)
  }`,
    `  public var body: some View {
    let base = UniversalPercentageParentBoundary(content: innerView)
      .applyAccessibilityIdentifier(props.testID)
      .applyModifiers(props.modifiers, appContext: props.appContext, globalEventDispatcher: props.globalEventDispatcher)
    if #available(iOS 16.0, *) {
      base
        .layoutValue(key: UniversalLayoutDimensionsKey.self, value: universalLayoutDimensions(from: props.modifiers))
        .publishZeroContentOrigin(props.shadowNodeProxy)
    } else {
      base
        .publishZeroContentOrigin(props.shadowNodeProxy)
    }
  }`,
    'UIBaseView.swift'
  )

  // UniversalLayout
  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `internal struct UniversalLayoutDimensionsKey: LayoutValueKey {`,
    `@available(iOS 16.0, *)
internal struct UniversalLayoutDimensionsKey: LayoutValueKey {`,
    'UniversalLayout.swift (UniversalLayoutDimensionsKey)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `  var body: some View {
    UniversalPercentageLayout(dimensions: dimensions, resolvesPercentages: resolvesPercentages) {
      content
    }
    .layoutValue(key: UniversalLayoutDimensionsKey.self, value: dimensions)
  }`,
    `  var body: some View {
    if #available(iOS 16.0, *) {
      UniversalPercentageLayout(dimensions: dimensions, resolvesPercentages: resolvesPercentages) {
        content
      }
      .layoutValue(key: UniversalLayoutDimensionsKey.self, value: dimensions)
    } else {
      content
    }
  }`,
    'UniversalLayout.swift (ResolvedUniversalLayout)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `internal struct UniversalPercentageLayout: Layout {`,
    `@available(iOS 16.0, *)
internal struct UniversalPercentageLayout: Layout {`,
    'UniversalLayout.swift (UniversalPercentageLayout)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `internal struct ParentAwareHStackLayout: Layout {`,
    `@available(iOS 16.0, *)
internal struct ParentAwareHStackLayout: Layout {`,
    'UniversalLayout.swift (ParentAwareHStackLayout)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `internal struct ParentAwareVStackLayout: Layout {`,
    `@available(iOS 16.0, *)
internal struct ParentAwareVStackLayout: Layout {`,
    'UniversalLayout.swift (ParentAwareVStackLayout)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `private struct StackConfiguration {`,
    `@available(iOS 16.0, *)
private struct StackConfiguration {`,
    'UniversalLayout.swift (StackConfiguration)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `private struct StackMeasurement {`,
    `@available(iOS 16.0, *)
private struct StackMeasurement {`,
    'UniversalLayout.swift (StackMeasurement)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `private func proposedSize(main: CGFloat?, cross: CGFloat?, axis: Axis) -> ProposedViewSize {`,
    `@available(iOS 16.0, *)
private func proposedSize(main: CGFloat?, cross: CGFloat?, axis: Axis) -> ProposedViewSize {`,
    'UniversalLayout.swift (proposedSize)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `private extension ProposedViewSize {`,
    `@available(iOS 16.0, *)
private extension ProposedViewSize {`,
    'UniversalLayout.swift (ProposedViewSize extension)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `private func placementProposal(bounds: CGRect, proposal: ProposedViewSize) -> ProposedViewSize {`,
    `@available(iOS 16.0, *)
private func placementProposal(bounds: CGRect, proposal: ProposedViewSize) -> ProposedViewSize {`,
    'UniversalLayout.swift (placementProposal)'
  )

  // UniversalLayout: StackLayoutCache & StackMeasurementKey
  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `internal struct StackLayoutCache {`,
    `@available(iOS 16.0, *)
internal struct StackLayoutCache {`,
    'UniversalLayout.swift (StackLayoutCache)'
  )
  replaceInFile(
    'node_modules/@expo/ui/ios/UniversalLayout.swift',
    `private struct StackMeasurementKey: Hashable {`,
    `@available(iOS 16.0, *)
private struct StackMeasurementKey: Hashable {`,
    'UniversalLayout.swift (StackMeasurementKey)'
  )

  // ToolbarItemPlacementOptions: secondaryAction
  replaceInFile(
    'node_modules/@expo/ui/ios/Convertibles/ToolbarItemPlacementOptions.swift',
    `    case .secondaryAction:
#if os(tvOS)
      return .automatic
#else
      return .secondaryAction
#endif`,
    `    case .secondaryAction:
#if os(tvOS)
      return .automatic
#else
      if #available(iOS 16.0, *) {
        return .secondaryAction
      }
      return .automatic
#endif`,
    'ToolbarItemPlacementOptions.swift'
  )

  // ScrollIndicatorVisibilityOptions: toVisibility
  replaceInFile(
    'node_modules/@expo/ui/ios/Convertibles/ScrollIndicatorVisibilityOptions.swift',
    `  func toVisibility() -> ScrollIndicatorVisibility {`,
    `  @available(iOS 16.0, *)
  func toVisibility() -> ScrollIndicatorVisibility {`,
    'ScrollIndicatorVisibilityOptions.swift'
  )

  // ScrollIndicatorsModifier
  replaceInFile(
    'node_modules/@expo/ui/ios/Modifiers/ScrollIndicatorsModifier.swift',
    `  func body(content: Content) -> some View {
    content.scrollIndicators(visibility.toVisibility(), axes: axes.toAxis())
  }`,
    `  func body(content: Content) -> some View {
    if #available(iOS 16.0, *) {
      content.scrollIndicators(visibility.toVisibility(), axes: axes.toAxis())
    } else {
      content
    }
  }`,
    'ScrollIndicatorsModifier.swift'
  )

  // RNHostView: onGeometryChange
  replaceInFile(
    'node_modules/@expo/ui/ios/RNHostView.swift',
    `  func body(content: Content) -> some View {
    if isEnabled {
      content
        .onGeometryChange(for: CGPoint?.self) { proxy in
          originInHost(proxy)
        } action: { origin in
          if let origin {
            shadowNodeProxy.setContentOrigin?(origin)
          }
        }
        .onDisappear {
          shadowNodeProxy.clearContentOrigin?()
        }
    } else {
      content
    }
  }`,
    `  func body(content: Content) -> some View {
    if isEnabled {
      if #available(iOS 16.0, *) {
        content
          .onGeometryChange(for: CGPoint?.self) { proxy in
            originInHost(proxy)
          } action: { origin in
            if let origin {
              shadowNodeProxy.setContentOrigin?(origin)
            }
          }
          .onDisappear {
            shadowNodeProxy.clearContentOrigin?()
          }
      } else {
        content
      }
    } else {
      content
    }
  }`,
    'RNHostView.swift (PublishContentOriginModifier)'
  )

  // PresentationModifiers: presentationCornerRadius
  replaceInFile(
    'node_modules/@expo/ui/ios/Modifiers/PresentationModifiers.swift',
    `  func body(content: Content) -> some View {
    content.presentationCornerRadius(cornerRadius.map { CGFloat($0) })
  }`,
    `  func body(content: Content) -> some View {
    if #available(iOS 16.4, tvOS 16.4, *) {
      content.presentationCornerRadius(cornerRadius.map { CGFloat($0) })
    } else {
      content
    }
  }`,
    'PresentationModifiers.swift (presentationCornerRadius)'
  )

  // PresentationModifiers: presentationBackground
  replaceInFile(
    'node_modules/@expo/ui/ios/Modifiers/PresentationModifiers.swift',
    `  func body(content: Content) -> some View {
    if let shapeStyle = style?.toAnyShapeStyle() {
      content.presentationBackground(shapeStyle)
    } else {
      content
    }
  }`,
    `  func body(content: Content) -> some View {
    if #available(iOS 16.4, tvOS 16.4, *), let shapeStyle = style?.toAnyShapeStyle() {
      content.presentationBackground(shapeStyle)
    } else {
      content
    }
  }`,
    'PresentationModifiers.swift (presentationBackground)'
  )

  // NavigationSplitViewView: NavigationSplitViewVisibility methods and properties
  replaceInFile(
    'node_modules/@expo/ui/ios/NavigationSplitViewView.swift',
    `  func toVisibility() -> NavigationSplitViewVisibility {`,
    `  @available(iOS 16.0, *)
  func toVisibility() -> NavigationSplitViewVisibility {`,
    'NavigationSplitViewView.swift (toVisibility)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/NavigationSplitViewView.swift',
    `  static func from(_ visibility: NavigationSplitViewVisibility) -> NavigationSplitViewVisibilityOptions {`,
    `  @available(iOS 16.0, *)
  static func from(_ visibility: NavigationSplitViewVisibility) -> NavigationSplitViewVisibilityOptions {`,
    'NavigationSplitViewView.swift (from visibility)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/NavigationSplitViewView.swift',
    `  private var columnVisibilityBinding: Binding<NavigationSplitViewVisibility> {`,
    `  @available(iOS 16.0, *)
  private var columnVisibilityBinding: Binding<NavigationSplitViewVisibility> {`,
    'NavigationSplitViewView.swift (columnVisibilityBinding)'
  )

  replaceInFile(
    'node_modules/@expo/ui/ios/NavigationSplitViewView.swift',
    `  private var compactColumnBinding: Binding<NavigationSplitViewColumn> {`,
    `  @available(iOS 16.0, *)
  private var compactColumnBinding: Binding<NavigationSplitViewColumn> {`,
    'NavigationSplitViewView.swift (compactColumnBinding)'
  )
}

patchPodspecsIn(path.resolve('node_modules'))
patchPodspecsIn(path.resolve('modules'))
patchScreenOrientation()
patchExpoVideo()
patchSceneGeometry()
patchExpoUI()
