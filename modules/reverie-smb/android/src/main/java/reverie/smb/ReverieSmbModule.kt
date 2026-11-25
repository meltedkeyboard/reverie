package reverie.smb

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.hierynomus.msdtyp.AccessMask
import com.hierynomus.msfscc.FileAttributes
import com.hierynomus.mssmb2.SMB2CreateDisposition
import com.hierynomus.mssmb2.SMB2CreateOptions
import com.hierynomus.mssmb2.SMB2ShareAccess
import com.hierynomus.smbj.SMBClient
import com.hierynomus.smbj.SmbConfig
import com.hierynomus.smbj.auth.AuthenticationContext
import com.hierynomus.smbj.connection.Connection
import com.hierynomus.smbj.session.Session
import com.hierynomus.smbj.share.DiskShare
import com.hierynomus.smbj.utils.SmbFiles
import com.rapid7.client.dcerpc.mssrvs.ServerService
import com.rapid7.client.dcerpc.transport.RPCTransport
import com.rapid7.client.dcerpc.transport.SMBTransportFactories
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.net.Inet4Address
import java.net.InetAddress
import java.security.KeyStore
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
private const val KEY_ALIAS = "reverie_smb_secret_key"
private const val CIPHER_TRANSFORMATION = "AES/GCM/NoPadding"
private const val PREFS_SECRETS = "reverie.smb.secrets"
private const val GCM_IV_LENGTH = 12
private const val GCM_TAG_LENGTH = 128

class ReverieSmbModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val secretPreferences
    get() = context.getSharedPreferences(PREFS_SECRETS, Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("ReverieSmb")

    AsyncFunction("testConnection") { config: Map<String, Any?> ->
      testConnection(config)
    }

    AsyncFunction("listShares") { config: Map<String, Any?> ->
      listShares(config)
    }

    AsyncFunction("listDirectory") { config: Map<String, Any?>, path: String ->
      listDirectory(config, path)
    }

    AsyncFunction("createDirectory") { config: Map<String, Any?>, path: String ->
      createDirectory(config, path)
    }

    AsyncFunction("list") { config: Map<String, Any?>, path: String ->
      list(config, path)
    }

    AsyncFunction("copyIn") { config: Map<String, Any?>, path: String, localUri: String ->
      copyIn(config, path, localUri)
    }

    AsyncFunction("copyOut") { config: Map<String, Any?>, localUri: String, path: String ->
      copyOut(config, localUri, path)
    }

    AsyncFunction("remove") { config: Map<String, Any?>, path: String ->
      remove(config, path)
    }

    AsyncFunction("savePassword") { key: String, secret: String ->
      savePassword(key, secret)
    }

    AsyncFunction("getPassword") { key: String ->
      getPassword(key)
    }

    AsyncFunction("deletePassword") { key: String ->
      deletePassword(key)
    }
  }

  private fun testConnection(config: Map<String, Any?>): Map<String, Any?> {
    return try {
      val parsed = parseConfig(config)
      if (parsed.share.isEmpty()) {
        withClient(config, connectTimeoutMs = 5000) { _, _, session ->
          try {
            val transport: RPCTransport = SMBTransportFactories.SRVSVC.getTransport(session)
            val srv = ServerService(transport)
            srv.shares0
          } catch (_: Exception) {
            // Authentication succeeded even if share enumeration via SRVSVC was denied
          }
          mapOf("ok" to true, "protocol" to "SMB 2/3")
        }
      } else {
        withShare(config, connectTimeoutMs = 5000) { share ->
          if (!share.folderExists("")) {
            share.list("")
          }
          mapOf("ok" to true, "protocol" to "SMB 2/3")
        }
      }
    } catch (e: Exception) {
      mapOf("ok" to false, "error" to (e.message ?: e.toString()))
    }
  }

  private fun listShares(config: Map<String, Any?>): List<String> {
    return withClient(config) { _, _, session ->
      val transport: RPCTransport = SMBTransportFactories.SRVSVC.getTransport(session)
      val srv = ServerService(transport)
      srv.shares0.mapNotNull { it.netName }
        .filter { !it.endsWith("$") && !it.startsWith(".") }
    }
  }

  private fun listDirectory(config: Map<String, Any?>, path: String): List<Map<String, Any>> {
    val cleanPath = path.replace('\\', '/').trim('/')
    return withShare(config) { share ->
      val smbPath = cleanPath.replace('/', '\\')
      val entries = share.list(smbPath)
      entries.mapNotNull { entry ->
        val name = entry.fileName
        if (name == "." || name == ".." || name.startsWith(".")) return@mapNotNull null
        val isDir = (entry.fileAttributes and FileAttributes.FILE_ATTRIBUTE_DIRECTORY.value) != 0L
        val size = entry.endOfFile
        val modifiedAt = try {
          entry.lastWriteTime.toEpochMillis()
        } catch (_: Exception) {
          0L
        }
        mapOf(
          "name" to name,
          "isDirectory" to isDir,
          "size" to size,
          "modifiedAt" to modifiedAt
        )
      }
    }
  }

  private fun createDirectory(config: Map<String, Any?>, path: String) {
    val cleanPath = path.replace('\\', '/').trim('/')
    if (cleanPath.isEmpty()) return
    withShare(config) { share ->
      ensureDirectories(share, cleanPath)
    }
  }

  private fun list(config: Map<String, Any?>, path: String): List<String> {
    val targetPath = resolveSubpath(config, path)
    return withShare(config) { share ->
      val smbPath = targetPath.replace('/', '\\')
      if (smbPath.isNotEmpty() && !share.folderExists(smbPath)) {
        return@withShare emptyList()
      }
      try {
        val entries = share.list(smbPath)
        entries.mapNotNull { entry ->
          val name = entry.fileName
          if (name == "." || name == ".." || name.startsWith(".")) null else name
        }
      } catch (_: Exception) {
        emptyList()
      }
    }
  }

  private fun copyIn(config: Map<String, Any?>, path: String, localUri: String) {
    val remotePath = resolveSubpath(config, path).replace('/', '\\')
    val localFile = fileFromUri(localUri)
    localFile.parentFile?.mkdirs()
    withShare(config) { share ->
      val remoteFile = share.openFile(
        remotePath,
        setOf(AccessMask.GENERIC_READ),
        null,
        SMB2ShareAccess.ALL,
        SMB2CreateDisposition.FILE_OPEN,
        null
      )
      val tempFile = File.createTempFile("smb_dl_", ".tmp", localFile.parentFile)
      try {
        remoteFile.use { rf ->
          tempFile.outputStream().use { out ->
            rf.read(out)
            out.flush()
          }
        }
        val remoteSize = try {
          remoteFile.fileInformation.standardInformation.endOfFile
        } catch (_: Exception) {
          -1L
        }
        if (remoteSize > 0L && tempFile.length() == 0L) {
          throw IOException("Downloaded file is incomplete: $path")
        }
        if (localFile.exists()) {
          localFile.delete()
        }
        if (!tempFile.renameTo(localFile)) {
          tempFile.inputStream().use { inp ->
            localFile.outputStream().use { out ->
              inp.copyTo(out)
              out.flush()
            }
          }
          tempFile.delete()
        }
      } catch (e: Exception) {
        tempFile.delete()
        throw e
      }
    }
  }

  private fun copyOut(config: Map<String, Any?>, localUri: String, path: String) {
    val remotePath = resolveSubpath(config, path).replace('/', '\\')
    val localFile = fileFromUri(localUri)
    if (!localFile.exists()) {
      throw FileNotFoundException("Local file not found: $localUri")
    }
    val remoteDir = File(remotePath).parent?.replace('\\', '/') ?: ""
    withShare(config) { share ->
      if (remoteDir.isNotEmpty() && remoteDir != "/" && remoteDir != ".") {
        ensureDirectories(share, remoteDir)
      }
      if (share.fileExists(remotePath)) {
        try {
          share.rm(remotePath)
        } catch (_: Exception) {}
      }
      SmbFiles.copy(localFile, share, remotePath, true)
    }
  }

  private fun remove(config: Map<String, Any?>, path: String) {
    val remotePath = resolveSubpath(config, path).replace('/', '\\')
    withShare(config) { share ->
      if (share.fileExists(remotePath)) {
        share.rm(remotePath)
      } else if (share.folderExists(remotePath)) {
        share.rmdir(remotePath, true)
      }
    }
  }

  private fun savePassword(key: String, secret: String) {
    val secretKey = getOrCreateKey()
    val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, secretKey)
    val iv = cipher.iv
    val encrypted = cipher.doFinal(secret.toByteArray(Charsets.UTF_8))
    val combined = ByteArray(iv.size + encrypted.size)
    System.arraycopy(iv, 0, combined, 0, iv.size)
    System.arraycopy(encrypted, 0, combined, iv.size, encrypted.size)
    val encoded = Base64.encodeToString(combined, Base64.NO_WRAP)
    secretPreferences.edit().putString(key, encoded).apply()
  }

  private fun getPassword(key: String): String? {
    val encoded = secretPreferences.getString(key, null) ?: return null
    return try {
      val combined = Base64.decode(encoded, Base64.NO_WRAP)
      if (combined.size < GCM_IV_LENGTH) return null
      val iv = ByteArray(GCM_IV_LENGTH)
      val ciphertext = ByteArray(combined.size - GCM_IV_LENGTH)
      System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH)
      System.arraycopy(combined, GCM_IV_LENGTH, ciphertext, 0, ciphertext.size)
      val secretKey = getOrCreateKey()
      val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
      val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
      cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)
      val decrypted = cipher.doFinal(ciphertext)
      String(decrypted, Charsets.UTF_8)
    } catch (_: Exception) {
      null
    }
  }

  private fun deletePassword(key: String) {
    secretPreferences.edit().remove(key).apply()
  }

  private fun getOrCreateKey(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    if (keyStore.containsAlias(KEY_ALIAS)) {
      val entry = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
      if (entry != null) return entry.secretKey
    }
    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
    val spec = KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()
    keyGenerator.init(spec)
    return keyGenerator.generateKey()
  }

  private fun ensureDirectories(share: DiskShare, path: String) {
    val clean = path.replace('\\', '/').trim('/')
    if (clean.isEmpty()) return
    val parts = clean.split('/').filter { it.isNotEmpty() }
    var current = ""
    for (part in parts) {
      current = if (current.isEmpty()) part else "$current\\$part"
      if (!share.folderExists(current)) {
        try {
          share.mkdir(current)
        } catch (e: Exception) {
          if (!share.folderExists(current)) throw e
        }
      }
    }
  }

  private fun resolveSubpath(config: Map<String, Any?>, path: String): String {
    val rawBase = (config["path"] as? String)?.replace('\\', '/') ?: ""
    val rawPath = path.replace('\\', '/')
    val base = rawBase.trim('/')
    val cleanPath = rawPath.trim('/')
    if (base.isEmpty()) return cleanPath
    if (cleanPath.isEmpty()) return base
    return "$base/$cleanPath"
  }

  private inline fun <T> withClient(
    config: Map<String, Any?>,
    connectTimeoutMs: Long = 15000,
    block: (client: SMBClient, connection: Connection, session: Session) -> T
  ): T {
    val parsed = parseConfig(config)
    val smbConfig = SmbConfig.builder()
      .withTimeout(connectTimeoutMs, TimeUnit.MILLISECONDS)
      .withSoTimeout(connectTimeoutMs, TimeUnit.MILLISECONDS)
      .withSigningRequired(false)
      .build()
    val client = SMBClient(smbConfig)
    return try {
      val resolvedHost = try {
        val addrs = InetAddress.getAllByName(parsed.host)
        addrs.firstOrNull { it is Inet4Address }?.hostAddress ?: parsed.host
      } catch (_: Exception) {
        parsed.host
      }
      val connection = client.connect(resolvedHost, parsed.port)
      connection.use { conn ->
        val auth = if (!parsed.username.isNullOrEmpty()) {
          AuthenticationContext(parsed.username, parsed.password.toCharArray(), parsed.domain)
        } else {
          AuthenticationContext.anonymous()
        }
        val session = conn.authenticate(auth)
        session.use { sess ->
          block(client, conn, sess)
        }
      }
    } finally {
      client.close()
    }
  }

  private inline fun <T> withShare(
    config: Map<String, Any?>,
    connectTimeoutMs: Long = 15000,
    block: (share: DiskShare) -> T
  ): T {
    val parsed = parseConfig(config)
    if (parsed.share.isEmpty()) {
      throw IllegalArgumentException("Share name is required")
    }
    return withClient(config, connectTimeoutMs = connectTimeoutMs) { _, _, session ->
      val share = session.connectShare(parsed.share) as? DiskShare
        ?: throw IllegalStateException("Share '${parsed.share}' is not a disk share")
      share.use { disk ->
        block(disk)
      }
    }
  }

  private fun fileFromUri(uriString: String): File {
    val uri = Uri.parse(uriString)
    val path = if (uri.scheme.equals("file", ignoreCase = true)) uri.path else uriString
    return File(path ?: uriString)
  }

  private data class ParsedConfig(
    val host: String,
    val port: Int,
    val share: String,
    val path: String,
    val username: String?,
    val password: String,
    val domain: String?
  )

  private fun parseConfig(config: Map<String, Any?>): ParsedConfig {
    val host = (config["host"] as? String)?.trim()
    if (host.isNullOrEmpty()) {
      throw IllegalArgumentException("Host address is required")
    }
    val port = (config["port"] as? Number)?.toInt()
      ?: (config["port"] as? String)?.toIntOrNull()
      ?: 445
    val rawShare = (config["share"] as? String)?.replace('\\', '/') ?: ""
    val share = rawShare.trim('/')
    val rawPath = (config["path"] as? String)?.replace('\\', '/') ?: ""
    val path = rawPath.trim('/')
    val username = (config["username"] as? String)?.trim()?.takeIf { it.isNotEmpty() }
    val password = (config["password"] as? String) ?: ""
    val domain = (config["domain"] as? String)?.trim()?.takeIf { it.isNotEmpty() }
    return ParsedConfig(host, port, share, path, username, password, domain)
  }
}
