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
          let (client, share) = try self.makeClient(from: config)
          if share.isEmpty {
            client.listShares { result in
              client.disconnectShare()
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
          } else {
            client.connectShare(name: share) { error in
              if let error = error {
                client.disconnectShare()
                promise.resolve([
                  "ok": false,
                  "error": error.localizedDescription
                ])
                return
              }
              client.contentsOfDirectory(atPath: "") { result in
                client.disconnectShare()
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
            client.disconnectShare()
            switch result {
            case .success(let shares):
              let names = shares.map { $0.name }
              promise.resolve(names)
            case .failure(let error):
              promise.reject("E_SMB_LIST", error.localizedDescription)
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
              client.disconnectShare()
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            client.contentsOfDirectory(atPath: cleanPath) { result in
              client.disconnectShare()
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
              client.disconnectShare()
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            self.createDirectoryRecursively(client: client, path: path) { createError in
              client.disconnectShare()
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
          let (client, share) = try self.makeClient(from: config)
          guard !share.isEmpty else {
            promise.resolve([])
            return
          }
          let targetPath = self.resolveSubpath(config: config, path: path)
          client.connectShare(name: share) { error in
            if let error = error {
              client.disconnectShare()
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            client.contentsOfDirectory(atPath: targetPath) { result in
              client.disconnectShare()
              switch result {
              case .success(let entries):
                let names = entries.compactMap { dict -> String? in
                  guard let name = dict[.nameKey] as? String else { return nil }
                  return name.hasPrefix(".") ? nil : name
                }
                promise.resolve(names)
              case .failure:
                // If directory doesn't exist yet, return empty list
                promise.resolve([])
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
          let (client, share) = try self.makeClient(from: config)
          guard !share.isEmpty else {
            promise.reject("E_SMB_NOSHARE", "Share name is required to copy file")
            return
          }
          let remotePath = self.resolveSubpath(config: config, path: path)
          client.connectShare(name: share) { error in
            if let error = error {
              client.disconnectShare()
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            try? FileManager.default.createDirectory(at: localUri.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: localUri)
            client.downloadItem(atPath: remotePath, to: localUri, progress: nil) { downloadError in
              client.disconnectShare()
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
          let (client, share) = try self.makeClient(from: config)
          guard !share.isEmpty else {
            promise.reject("E_SMB_NOSHARE", "Share name is required to upload file")
            return
          }
          let remotePath = self.resolveSubpath(config: config, path: path)
          client.connectShare(name: share) { error in
            if let error = error {
              client.disconnectShare()
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            let remoteDir = (remotePath as NSString).deletingLastPathComponent
            let upload = {
              let startUpload = {
                client.uploadItem(at: localUri, toPath: remotePath, progress: nil) { uploadError in
                  if let uploadError = uploadError {
                    let nsError = uploadError as NSError
                    let isCollision = nsError.code == 17
                      || nsError.localizedDescription.contains("0xc0000035")
                      || nsError.localizedDescription.contains("STATUS_OBJECT_NAME_COLLISION")
                    if isCollision {
                      client.removeItem(atPath: remotePath) { _ in
                        client.uploadItem(at: localUri, toPath: remotePath, progress: nil) { retryError in
                          client.disconnectShare()
                          if let retryError = retryError {
                            promise.reject("E_SMB_UPLOAD", retryError.localizedDescription)
                          } else {
                            promise.resolve()
                          }
                        }
                      }
                      return
                    }
                    client.disconnectShare()
                    promise.reject("E_SMB_UPLOAD", uploadError.localizedDescription)
                  } else {
                    client.disconnectShare()
                    promise.resolve()
                  }
                }
              }

              // Overwrite destination file: remove it first because AMSMB2 uploadItem
              // opens with FILE_CREATE and fails with STATUS_OBJECT_NAME_COLLISION (0xc0000035).
              client.removeItem(atPath: remotePath) { _ in
                startUpload()
              }
            }
            if !remoteDir.isEmpty && remoteDir != "/" && remoteDir != "." {
              self.createDirectoryRecursively(client: client, path: remoteDir) { _ in
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
          let (client, share) = try self.makeClient(from: config)
          guard !share.isEmpty else {
            promise.resolve()
            return
          }
          let remotePath = self.resolveSubpath(config: config, path: path)
          client.connectShare(name: share) { error in
            if let error = error {
              client.disconnectShare()
              promise.reject("E_SMB_CONNECT", error.localizedDescription)
              return
            }
            client.removeItem(atPath: remotePath) { _ in
              client.disconnectShare()
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
    let rawBase = (config["path"] as? String)?.replacingOccurrences(of: "\\", with: "/") ?? ""
    let rawPath = path.replacingOccurrences(of: "\\", with: "/")
    let base = rawBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let cleanPath = rawPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    if base.isEmpty { return cleanPath }
    if cleanPath.isEmpty { return base }
    return "\(base)/\(cleanPath)"
  }

  #if canImport(AMSMB2)
  private func createDirectoryRecursively(client: AMSMB2, path: String, completion: @escaping (Error?) -> Void) {
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
      client.createDirectory(atPath: currentPath) { _ in
        // Intermediate directory may already exist, ignore errors and proceed
        step()
      }
    }

    step()
  }

  private func makeClient(from config: [String: Any]) throws -> (client: AMSMB2, share: String) {
    guard let host = config["host"] as? String, !host.isEmpty else {
      throw Exception(name: "InvalidHost", description: "Host address is required")
    }
    let port = config["port"] as? Int ?? 445
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
