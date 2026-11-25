import ExpoModulesCore
import Foundation
import Security

#if canImport(AMSMB2)
import AMSMB2
#endif

public class ReverieSmbModule: Module {
  private static let keychainService = "reverie.smb"
  private let queue = DispatchQueue(label: "reverie.smb.worker", qos: .userInitiated)

  #if canImport(AMSMB2)
  private var sessionClient: AMSMB2?
  private var sessionKey: String?
  private var sessionDirs = Set<String>()
  #endif

  public func definition() -> ModuleDefinition {
    Name("ReverieSmb")

    AsyncFunction("testConnection") { (config: [String: Any], promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        do {
          let (client, share) = try self.makeClient(from: config)
          if share.isEmpty {
            client.listShares { result in
              self.disconnect(client) {
                switch result {
                case .success:
                  promise.resolve([
                    "ok": true,
                    "protocol": "SMB 2/3"
                  ])
                case .failure(let error):
                  promise.resolve([
                    "ok": false,
                    "error": error.localizedDescription
                  ])
                }
              }
            }
          } else {
            client.connectShare(name: share) { error in
              if let error = error {
                self.disconnect(client) {
                  promise.resolve([
                    "ok": false,
                    "error": error.localizedDescription
                  ])
                }
                return
              }
              client.contentsOfDirectory(atPath: "") { result in
                self.disconnect(client) {
                  switch result {
                  case .success:
                    promise.resolve([
                      "ok": true,
                      "protocol": "SMB 2/3"
                    ])
                  case .failure(let listError):
                    promise.resolve([
                      "ok": false,
                      "error": listError.localizedDescription
                    ])
                  }
                }
              }
            }
          }
        } catch {
          promise.resolve([
            "ok": false,
            "error": error.localizedDescription
          ])
        }
        #else
        promise.resolve([
          "ok": false,
          "error": "AMSMB2 pod is not compiled in this build"
        ])
        #endif
      }
    }

    AsyncFunction("listShares") { (config: [String: Any], promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        do {
          let (client, _) = try self.makeClient(from: config)
          client.listShares { result in
            self.disconnect(client) {
              switch result {
              case .success(let shares):
                let names = shares.map { $0.name }
                promise.resolve(names)
              case .failure(let error):
                promise.reject("E_SMB_LIST", error.localizedDescription)
              }
            }
          }
        } catch {
          promise.reject("E_SMB_CONFIG", error.localizedDescription)
        }
        #else
        promise.resolve(["backups", "public", "reverie"])
        #endif
      }
    }

    AsyncFunction("listDirectory") { (config: [String: Any], path: String, promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        do {
          let (client, share) = try self.makeClient(from: config)
          guard !share.isEmpty else {
            promise.reject("E_SMB_NOSHARE", "Share name is required to list directory")
            return
          }
          let cleanPath = path.replacingOccurrences(of: "\\", with: "/").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
          client.connectShare(name: share) { error in
            if let error = error {
              self.disconnect(client) {
                promise.reject("E_SMB_CONNECT", error.localizedDescription)
              }
              return
            }
            client.contentsOfDirectory(atPath: cleanPath) { result in
              self.disconnect(client) {
                switch result {
                case .success(let entries):
                  let items: [[String: Any]] = entries.compactMap { dict -> [String: Any]? in
                    guard let name = dict[.nameKey] as? String else { return nil }
                    if name.hasPrefix(".") { return nil }
                    let isDir = (dict[.fileResourceTypeKey] as? URLFileResourceType) == .directory
                    let size = (dict[.fileSizeKey] as? NSNumber)?.int64Value ?? 0
                    let date = (dict[.contentModificationDateKey] as? Date)?.timeIntervalSince1970 ?? 0
                    return [
                      "name": name,
                      "isDirectory": isDir,
                      "size": size,
                      "modifiedAt": date * 1000
                    ]
                  }
                  promise.resolve(items)
                case .failure(let listError):
                  promise.reject("E_SMB_LIST", listError.localizedDescription)
                }
              }
            }
          }
        } catch {
          promise.reject("E_SMB_CONFIG", error.localizedDescription)
        }
        #else
        promise.resolve([])
        #endif
      }
    }

    AsyncFunction("createDirectory") { (config: [String: Any], path: String, promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        do {
          let (client, share) = try self.makeClient(from: config)
          guard !share.isEmpty else {
            promise.reject("E_SMB_NOSHARE", "Share name is required to create directory")
            return
          }
          client.connectShare(name: share) { error in
            if let error = error {
              self.disconnect(client) {
                promise.reject("E_SMB_CONNECT", error.localizedDescription)
              }
              return
            }
            self.ensureDirectories(client: client, isPooled: false, path: path) { createError in
              self.disconnect(client) {
                if let createError = createError {
                  promise.reject("E_SMB_MKDIR", createError.localizedDescription)
                } else {
                  promise.resolve()
                }
              }
            }
          }
        } catch {
          promise.reject("E_SMB_CONFIG", error.localizedDescription)
        }
        #else
        promise.resolve()
        #endif
      }
    }

    AsyncFunction("beginSession") { (config: [String: Any], promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        let previous = self.sessionClient
        self.sessionClient = nil
        self.sessionKey = nil
        self.sessionDirs.removeAll()

        let startNew = {
          self.queue.async {
            do {
              let key = self.configKey(from: config)
              let (client, share) = try self.makeClient(from: config)
              guard !share.isEmpty else {
                promise.reject("E_SMB_NOSHARE", "Share name is required")
                return
              }
              client.connectShare(name: share) { error in
                if let error = error {
                  self.disconnect(client) {
                    promise.reject("E_SMB_CONNECT", error.localizedDescription)
                  }
                  return
                }
                self.queue.async {
                  self.sessionClient = client
                  self.sessionKey = key
                  self.sessionDirs = []
                  promise.resolve()
                }
              }
            } catch {
              promise.reject("E_SMB_CONFIG", error.localizedDescription)
            }
          }
        }

        if let previous = previous {
          self.disconnect(previous, completion: startNew)
        } else {
          startNew()
        }
        #else
        promise.resolve()
        #endif
      }
    }

    AsyncFunction("endSession") { (promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        let client = self.sessionClient
        self.sessionClient = nil
        self.sessionKey = nil
        self.sessionDirs.removeAll()
        if let client = client {
          self.disconnect(client) {
            promise.resolve()
          }
        } else {
          promise.resolve()
        }
        #else
        promise.resolve()
        #endif
      }
    }

    // Sync file operations compatible with cloudSync:
    AsyncFunction("list") { (config: [String: Any], path: String, promise: Promise) in
      #if canImport(AMSMB2)
      self.withShareClient(config: config, promise: promise, onMissingShare: {
        promise.resolve([])
      }) { client, _, finish in
        let targetPath = self.resolveSubpath(config: config, path: path)
        client.contentsOfDirectory(atPath: targetPath) { result in
          switch result {
          case .success(let entries):
            let names = entries.compactMap { dict -> String? in
              guard let name = dict[.nameKey] as? String else { return nil }
              return name.hasPrefix(".") ? nil : name
            }
            finish { promise.resolve(names) }
          case .failure(let listError):
            if self.isNotFoundError(listError) {
              finish { promise.resolve([]) }
            } else {
              finish { promise.reject("E_SMB_LIST", "\(targetPath): \(listError.localizedDescription)") }
            }
          }
        }
      }
      #else
      promise.resolve([])
      #endif
    }

    AsyncFunction("copyIn") { (config: [String: Any], path: String, localUri: URL, promise: Promise) in
      #if canImport(AMSMB2)
      self.withShareClient(config: config, promise: promise) { client, _, finish in
        let remotePath = self.resolveSubpath(config: config, path: path)
        let parentDir = localUri.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)
        let tempLocal = parentDir.appendingPathComponent(".dl-\(UUID().uuidString.prefix(8))-\(localUri.lastPathComponent)")
        try? FileManager.default.removeItem(at: tempLocal)
        client.downloadItem(atPath: remotePath, to: tempLocal, progress: nil) { downloadError in
          if let downloadError = downloadError {
            try? FileManager.default.removeItem(at: tempLocal)
            finish {
              promise.reject("E_SMB_DOWNLOAD", "\(remotePath): \(downloadError.localizedDescription)")
            }
            return
          }
          do {
            if FileManager.default.fileExists(atPath: localUri.path) {
              try FileManager.default.removeItem(at: localUri)
            }
            try FileManager.default.moveItem(at: tempLocal, to: localUri)
            finish { promise.resolve() }
          } catch {
            try? FileManager.default.removeItem(at: tempLocal)
            finish { promise.reject("E_SMB_DOWNLOAD", error.localizedDescription) }
          }
        }
      }
      #else
      promise.resolve()
      #endif
    }

    AsyncFunction("copyOut") { (config: [String: Any], localUri: URL, path: String, promise: Promise) in
      #if canImport(AMSMB2)
      self.withShareClient(config: config, promise: promise) { client, isPooled, finish in
        let remotePath = self.resolveSubpath(config: config, path: path)
        let remoteDir = (remotePath as NSString).deletingLastPathComponent
        let runUpload = {
          self.stageAndReplace(client: client, localUri: localUri, toPath: remotePath) { uploadError in
            finish {
              if let uploadError = uploadError {
                promise.reject("E_SMB_UPLOAD", "\(remotePath): \(uploadError.localizedDescription)")
              } else {
                promise.resolve()
              }
            }
          }
        }
        if !remoteDir.isEmpty && remoteDir != "/" && remoteDir != "." {
          self.ensureDirectories(client: client, isPooled: isPooled, path: remoteDir) { dirError in
            if let dirError = dirError {
              finish {
                promise.reject("E_SMB_MKDIR", "\(remoteDir): \(dirError.localizedDescription)")
              }
            } else {
              runUpload()
            }
          }
        } else {
          runUpload()
        }
      }
      #else
      promise.resolve()
      #endif
    }

    AsyncFunction("remove") { (config: [String: Any], path: String, promise: Promise) in
      #if canImport(AMSMB2)
      self.withShareClient(config: config, promise: promise, onMissingShare: {
        promise.resolve()
      }) { client, _, finish in
        let remotePath = self.resolveSubpath(config: config, path: path)
        self.removeIfExists(client: client, path: remotePath) { _ in
          finish { promise.resolve() }
        }
      }
      #else
      promise.resolve()
      #endif
    }

    // Keychain password management:
    AsyncFunction("savePassword") { (key: String, secret: String) in
      guard let data = secret.data(using: .utf8) else { return }
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: Self.keychainService,
        kSecAttrAccount as String: key
      ]
      SecItemDelete(query as CFDictionary)
      var newAttr = query
      newAttr[kSecValueData as String] = data
      newAttr[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
      SecItemAdd(newAttr as CFDictionary, nil)
    }

    AsyncFunction("getPassword") { (key: String) -> String? in
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: Self.keychainService,
        kSecAttrAccount as String: key,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne
      ]
      var item: CFTypeRef?
      let status = SecItemCopyMatching(query as CFDictionary, &item)
      guard status == errSecSuccess, let data = item as? Data else { return nil }
      return String(data: data, encoding: .utf8)
    }

    AsyncFunction("deletePassword") { (key: String) in
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: Self.keychainService,
        kSecAttrAccount as String: key
      ]
      SecItemDelete(query as CFDictionary)
    }
  }

  private func resolveSubpath(config: [String: Any], path: String) -> String {
    let rawBase = (config["path"] as? String)?.replacingOccurrences(of: "\\", with: "/") ?? ""
    let rawPath = path.replacingOccurrences(of: "\\", with: "/")
    let base = rawBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let cleanPath = rawPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    if base.isEmpty { return cleanPath }
    if cleanPath.isEmpty { return base }
    return "\(base)/\(cleanPath)"
  }

  #if canImport(AMSMB2)
  private func configKey(from config: [String: Any]) -> String {
    let host = (config["host"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let port = (config["port"] as? NSNumber)?.intValue ?? 445
    let rawShare = (config["share"] as? String)?.replacingOccurrences(of: "\\", with: "/") ?? ""
    let share = rawShare.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let domain = (config["domain"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let username = (config["username"] as? String) ?? ""
    let password = (config["password"] as? String) ?? ""
    return "\(host):\(port)|\(share)|\(domain)|\(username)|\(password)"
  }

  private func disconnect(_ client: AMSMB2, completion: @escaping () -> Void) {
    client.disconnectShare(gracefully: true) { _ in
      completion()
    }
  }

  private func withShareClient(
    config: [String: Any],
    promise: Promise,
    onMissingShare: (() -> Void)? = nil,
    body: @escaping (_ client: AMSMB2, _ isPooled: Bool, _ finish: @escaping (@escaping () -> Void) -> Void) -> Void
  ) {
    self.queue.async {
      do {
        let key = self.configKey(from: config)
        let rawShare = (config["share"] as? String)?.replacingOccurrences(of: "\\", with: "/") ?? ""
        let share = rawShare.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !share.isEmpty else {
          if let onMissingShare = onMissingShare {
            onMissingShare()
          } else {
            promise.reject("E_SMB_NOSHARE", "Share name is required")
          }
          return
        }
        if let client = self.sessionClient, self.sessionKey == key {
          body(client, true) { settle in settle() }
          return
        }
        let (client, _) = try self.makeClient(from: config)
        client.connectShare(name: share) { error in
          if let error = error {
            self.disconnect(client) {
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
            }
            return
          }
          body(client, false) { settle in
            self.disconnect(client, completion: settle)
          }
        }
      } catch {
        promise.reject("E_SMB_CONFIG", error.localizedDescription)
      }
    }
  }

  private func isNotFoundError(_ error: Error) -> Bool {
    let ns = error as NSError
    if ns.domain == NSPOSIXErrorDomain && ns.code == Int(POSIXErrorCode.ENOENT.rawValue) {
      return true
    }
    let desc = ns.localizedDescription
    return desc.contains("0xc0000034")
      || desc.contains("STATUS_OBJECT_NAME_NOT_FOUND")
      || desc.contains("0xc000003a")
      || desc.contains("STATUS_OBJECT_PATH_NOT_FOUND")
      || desc.contains("0xc000000f")
      || desc.contains("STATUS_NO_SUCH_FILE")
  }

  private func isCollisionError(_ error: Error) -> Bool {
    let ns = error as NSError
    if ns.domain == NSPOSIXErrorDomain && ns.code == Int(POSIXErrorCode.EEXIST.rawValue) {
      return true
    }
    let desc = ns.localizedDescription
    return desc.contains("0xc0000035") || desc.contains("STATUS_OBJECT_NAME_COLLISION")
  }

  private func isTransientLockError(_ error: Error) -> Bool {
    let ns = error as NSError
    if ns.domain == NSPOSIXErrorDomain
      && (ns.code == Int(POSIXErrorCode.EACCES.rawValue) || ns.code == Int(POSIXErrorCode.EBUSY.rawValue)) {
      return true
    }
    let desc = ns.localizedDescription
    return desc.contains("0xc0000043")
      || desc.contains("STATUS_SHARING_VIOLATION")
      || desc.contains("0xc0000056")
      || desc.contains("STATUS_DELETE_PENDING")
      || desc.contains("0xc0000022")
      || desc.contains("STATUS_ACCESS_DENIED")
  }

  private func retryOnError(
    attempt: Int = 0,
    maxRetries: Int = 2,
    shouldRetry: @escaping (Error) -> Bool,
    operation: @escaping (@escaping (Error?) -> Void) -> Void,
    completion: @escaping (Error?) -> Void
  ) {
    operation { error in
      guard let error = error else {
        completion(nil)
        return
      }
      if attempt < maxRetries && shouldRetry(error) {
        let delay = 0.25 * Double(attempt + 1)
        self.queue.asyncAfter(deadline: .now() + delay) {
          self.retryOnError(
            attempt: attempt + 1,
            maxRetries: maxRetries,
            shouldRetry: shouldRetry,
            operation: operation,
            completion: completion
          )
        }
        return
      }
      completion(error)
    }
  }

  private func removeIfExists(
    client: AMSMB2,
    path: String,
    maxRetries: Int = 2,
    completion: @escaping (Error?) -> Void
  ) {
    self.retryOnError(
      maxRetries: maxRetries,
      shouldRetry: { self.isTransientLockError($0) },
      operation: { attemptDone in
        client.removeItem(atPath: path) { error in
          if let error = error, self.isNotFoundError(error) {
            attemptDone(nil)
          } else {
            attemptDone(error)
          }
        }
      },
      completion: completion
    )
  }

  private func directOverwrite(
    client: AMSMB2,
    localUri: URL,
    toPath remotePath: String,
    maxRetries: Int = 1,
    completion: @escaping (Error?) -> Void
  ) {
    self.retryOnError(
      maxRetries: maxRetries,
      shouldRetry: { self.isCollisionError($0) || self.isTransientLockError($0) },
      operation: { attemptDone in
        self.removeIfExists(client: client, path: remotePath, maxRetries: 0) { removeError in
          if let removeError = removeError {
            attemptDone(removeError)
            return
          }
          client.uploadItem(at: localUri, toPath: remotePath, progress: nil) { uploadError in
            attemptDone(uploadError)
          }
        }
      },
      completion: completion
    )
  }

  // Stage to a unique temporary file first so an active reader or indexer (e.g. OneDrive) on
  // the existing destination never blocks the upload stream, and failed uploads leave the old
  // file intact. Falls back to direct remove+upload if dotfiles or SMB rename are blocked.
  private func stageAndReplace(
    client: AMSMB2,
    localUri: URL,
    toPath remotePath: String,
    completion: @escaping (Error?) -> Void
  ) {
    let dir = (remotePath as NSString).deletingLastPathComponent
    let name = (remotePath as NSString).lastPathComponent
    let prefix = String(UUID().uuidString.prefix(8))
    let tempName = ".tmp-\(prefix)-\(name)"
    let tempPath = (dir.isEmpty || dir == "/" || dir == ".") ? tempName : "\(dir)/\(tempName)"

    self.retryOnError(
      maxRetries: 1,
      shouldRetry: { self.isTransientLockError($0) },
      operation: { attemptDone in
        client.uploadItem(at: localUri, toPath: tempPath, progress: nil) { attemptDone($0) }
      }
    ) { tempError in
      if tempError != nil {
        client.removeItem(atPath: tempPath) { _ in
          self.directOverwrite(client: client, localUri: localUri, toPath: remotePath, maxRetries: 1, completion: completion)
        }
        return
      }

      self.retryOnError(
        maxRetries: 2,
        shouldRetry: { self.isCollisionError($0) || self.isTransientLockError($0) },
        operation: { attemptDone in
          self.removeIfExists(client: client, path: remotePath, maxRetries: 1) { removeError in
            if let removeError = removeError {
              attemptDone(removeError)
              return
            }
            client.moveItem(atPath: tempPath, toPath: remotePath) { attemptDone($0) }
          }
        }
      ) { replaceError in
        guard let replaceError = replaceError else {
          completion(nil)
          return
        }
        client.removeItem(atPath: tempPath) { _ in
          if self.isCollisionError(replaceError) || self.isTransientLockError(replaceError) {
            completion(replaceError)
          } else {
            self.directOverwrite(client: client, localUri: localUri, toPath: remotePath, maxRetries: 0, completion: completion)
          }
        }
      }
    }
  }

  private func ensureDirectories(client: AMSMB2, isPooled: Bool, path: String, completion: @escaping (Error?) -> Void) {
    let normalized = path.replacingOccurrences(of: "\\", with: "/")
    let cleanPath = normalized.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard !cleanPath.isEmpty else {
      completion(nil)
      return
    }
    let parts = cleanPath.split(separator: "/").map(String.init)
    var currentPath = ""
    var index = 0

    func step() {
      guard index < parts.count else {
        completion(nil)
        return
      }
      let part = parts[index]
      currentPath = currentPath.isEmpty ? part : "\(currentPath)/\(part)"
      index += 1

      let dirPath = currentPath
      let markAndContinue = {
        self.queue.async {
          if isPooled {
            self.sessionDirs.insert(dirPath)
          }
          step()
        }
      }
      self.queue.async {
        if isPooled && self.sessionDirs.contains(dirPath) {
          step()
          return
        }
        client.createDirectory(atPath: dirPath) { createError in
          guard let createError = createError else {
            markAndContinue()
            return
          }
          if self.isCollisionError(createError) {
            markAndContinue()
            return
          }
          // Some SMB servers return ACCESS_DENIED when calling mkdir on an existing folder.
          // Confirm reachability via listing before rejecting.
          client.contentsOfDirectory(atPath: dirPath) { listResult in
            switch listResult {
            case .success:
              markAndContinue()
            case .failure:
              completion(createError)
            }
          }
        }
      }
    }

    step()
  }

  private func makeClient(from config: [String: Any]) throws -> (client: AMSMB2, share: String) {
    guard let host = config["host"] as? String, !host.isEmpty else {
      throw Exception(name: "InvalidHost", description: "Host address is required")
    }
    let port = (config["port"] as? NSNumber)?.intValue ?? 445
    let rawShare = (config["share"] as? String)?.replacingOccurrences(of: "\\", with: "/") ?? ""
    let share = rawShare.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let domain = (config["domain"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    let urlString = "smb://\(host):\(port)"
    guard let url = URL(string: urlString) else {
      throw Exception(name: "InvalidURL", description: "Invalid SMB URL for \(urlString)")
    }

    let credential: URLCredential?
    if let username = config["username"] as? String, !username.isEmpty {
      let password = config["password"] as? String ?? ""
      credential = URLCredential(user: username, password: password, persistence: .none)
    } else {
      credential = nil
    }

    guard let client = AMSMB2(url: url, domain: domain, credential: credential) else {
      throw Exception(name: "ClientInitFailed", description: "Failed to initialize AMSMB2 client")
    }

    return (client, share)
  }
  #endif
}
