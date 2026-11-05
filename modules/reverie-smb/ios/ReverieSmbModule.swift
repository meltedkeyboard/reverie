import ExpoModulesCore
import Foundation
import Security

#if canImport(AMSMB2)
import AMSMB2
#endif

public class ReverieSmbModule: Module {
  private static let keychainService = "reverie.smb"
  private let queue = DispatchQueue(label: "reverie.smb.worker", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("ReverieSmb")

    AsyncFunction("testConnection") { (config: [String: Any], promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        do {
          let client = try self.makeClient(from: config)
          client.connect { error in
            if let error = error {
              promise.resolve([
                "ok": false,
                "error": error.localizedDescription
              ])
              return
            }
            // Connected successfully. Check if share path can be listed or probed.
            client.contentsOfDirectory(atPath: "") { entries, listError in
              client.disconnect()
              if let listError = listError {
                promise.resolve([
                  "ok": false,
                  "error": listError.localizedDescription
                ])
              } else {
                promise.resolve([
                  "ok": true,
                  "protocol": "SMB 2/3"
                ])
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
          // Connect to the root host to enumerate shares.
          var rootConfig = config
          rootConfig["share"] = ""
          let client = try self.makeClient(from: rootConfig)
          client.connect { error in
            if let error = error {
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            client.contentsOfDirectory(atPath: "") { entries, listError in
              client.disconnect()
              if let listError = listError {
                promise.reject("E_SMB_LIST", listError.localizedDescription)
              } else {
                let shares = (entries ?? []).compactMap { dict -> String? in
                  return dict[.nameKey] as? String
                }
                promise.resolve(shares)
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
          let client = try self.makeClient(from: config)
          client.connect { error in
            if let error = error {
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            client.contentsOfDirectory(atPath: path) { entries, listError in
              client.disconnect()
              if let listError = listError {
                promise.reject("E_SMB_LIST", listError.localizedDescription)
              } else {
                let items: [[String: Any]] = (entries ?? []).compactMap { dict -> [String: Any]? in
                  guard let name = dict[.nameKey] as? String else { return nil }
                  // Skip hidden dotfiles
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
          let client = try self.makeClient(from: config)
          client.connect { error in
            if let error = error {
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            client.createDirectory(atPath: path) { createError in
              client.disconnect()
              if let createError = createError {
                promise.reject("E_SMB_MKDIR", createError.localizedDescription)
              } else {
                promise.resolve()
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

    // Sync file operations compatible with cloudSync:
    AsyncFunction("list") { (config: [String: Any], path: String, promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        do {
          let client = try self.makeClient(from: config)
          let targetPath = self.resolveSubpath(config: config, path: path)
          client.connect { error in
            if let error = error {
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            client.contentsOfDirectory(atPath: targetPath) { entries, listError in
              client.disconnect()
              if let listError = listError {
                // If directory doesn't exist yet, return empty list
                promise.resolve([])
              } else {
                let names = (entries ?? []).compactMap { dict -> String? in
                  guard let name = dict[.nameKey] as? String else { return nil }
                  return name.hasPrefix(".") ? nil : name
                }
                promise.resolve(names)
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

    AsyncFunction("copyIn") { (config: [String: Any], path: String, localUri: URL, promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        do {
          let client = try self.makeClient(from: config)
          let remotePath = self.resolveSubpath(config: config, path: path)
          client.connect { error in
            if let error = error {
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            // Ensure local parent directory exists
            try? FileManager.default.createDirectory(at: localUri.deletingLastPathComponent(), withIntermediateDirectories: true)
            // If local file exists, remove it before downloading to replace atomically
            try? FileManager.default.removeItem(at: localUri)
            client.downloadItem(atPath: remotePath, to: localUri, progress: nil) { downloadError in
              client.disconnect()
              if let downloadError = downloadError {
                promise.reject("E_SMB_DOWNLOAD", downloadError.localizedDescription)
              } else {
                promise.resolve()
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

    AsyncFunction("copyOut") { (config: [String: Any], localUri: URL, path: String, promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        do {
          let client = try self.makeClient(from: config)
          let remotePath = self.resolveSubpath(config: config, path: path)
          client.connect { error in
            if let error = error {
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            // Ensure remote directory exists if path contains subfolders
            let remoteDir = (remotePath as NSString).deletingLastPathComponent
            let upload = {
              client.uploadItem(at: localUri, toPath: remotePath, progress: nil) { uploadError in
                client.disconnect()
                if let uploadError = uploadError {
                  promise.reject("E_SMB_UPLOAD", uploadError.localizedDescription)
                } else {
                  promise.resolve()
                }
              }
            }
            if !remoteDir.isEmpty && remoteDir != "/" && remoteDir != "." {
              client.createDirectory(atPath: remoteDir) { _ in
                upload()
              }
            } else {
              upload()
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

    AsyncFunction("remove") { (config: [String: Any], path: String, promise: Promise) in
      self.queue.async {
        #if canImport(AMSMB2)
        do {
          let client = try self.makeClient(from: config)
          let remotePath = self.resolveSubpath(config: config, path: path)
          client.connect { error in
            if let error = error {
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            client.removeItem(atPath: remotePath) { _ in
              client.disconnect()
              promise.resolve()
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
    let base = (config["path"] as? String)?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
    let cleanPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    if base.isEmpty { return cleanPath }
    if cleanPath.isEmpty { return base }
    return "\(base)/\(cleanPath)"
  }

  #if canImport(AMSMB2)
  private func makeClient(from config: [String: Any]) throws -> AMSMB2 {
    guard let host = config["host"] as? String, !host.isEmpty else {
      throw Exception(name: "InvalidHost", description: "Host address is required")
    }
    let port = config["port"] as? Int ?? 445
    let share = (config["share"] as? String)?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""

    let urlString: String
    if share.isEmpty {
      urlString = "smb://\(host):\(port)"
    } else {
      urlString = "smb://\(host):\(port)/\(share)"
    }
    guard let url = URL(string: urlString) else {
      throw Exception(name: "InvalidURL", description: "Invalid SMB URL for \(urlString)")
    }
    guard let client = AMSMB2(url: url) else {
      throw Exception(name: "ClientInitFailed", description: "Failed to initialize AMSMB2 client")
    }

    if let username = config["username"] as? String, !username.isEmpty {
      let password = config["password"] as? String ?? ""
      client.credential = URLCredential(user: username, password: password, persistence: .none)
    }
    return client
  }
  #endif
}
