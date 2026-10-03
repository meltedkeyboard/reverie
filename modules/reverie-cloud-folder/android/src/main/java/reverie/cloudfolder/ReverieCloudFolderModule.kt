package reverie.cloudfolder

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

private const val PICK_FOLDER_CODE = 4291
private const val PREFERENCES = "reverie.cloudFolder"
private const val TREE_KEY = "tree"
private const val SUBFOLDER_KEY = "subfolder"
// Created inside the picked folder, unless the picked folder already is one.
private const val SUBFOLDER_NAME = "Reverie Sync"
private const val MANIFEST_NAME = "manifest.json"

// A folder the user picked through the system folder picker (a local one, or one of a
// cloud provider such as Google Drive), remembered across launches by a persisted
// permission on its tree uri. The same job as the iOS module of this name.
// Paths from JS are relative to the sync folder, "" being the folder itself.
class ReverieCloudFolderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val preferences
    get() = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private var pendingPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("ReverieCloudFolder")

    // Resolves to the folder's name, or null when the picker is cancelled.
    AsyncFunction("pickFolder") { promise: Promise ->
      if (pendingPromise != null) {
        promise.reject("E_PICKING", "The folder picker is already open", null)
        return@AsyncFunction
      }
      pendingPromise = promise
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        addFlags(
          Intent.FLAG_GRANT_READ_URI_PERMISSION or
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        )
      }
      appContext.throwingActivity.startActivityForResult(intent, PICK_FOLDER_CODE)
    }

    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode != PICK_FOLDER_CODE) return@OnActivityResult
      val promise = pendingPromise ?: return@OnActivityResult
      pendingPromise = null
      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(null)
        return@OnActivityResult
      }
      try {
        promise.resolve(remember(uri))
      } catch (e: Exception) {
        promise.reject("E_FOLDER", e.message ?: "The folder can't be used", e)
      }
    }

    // The name of the remembered folder, or null when there is none or it is gone.
    Function("folderName") {
      try {
        root().name
      } catch (e: Exception) {
        null
      }
    }

    Function("forgetFolder") {
      preferences.getString(TREE_KEY, null)?.let { release(Uri.parse(it)) }
      preferences.edit().remove(TREE_KEY).remove(SUBFOLDER_KEY).apply()
    }

    AsyncFunction("list") { path: String ->
      val dir = find(path)
      if (dir == null || !dir.isDirectory) emptyList<String>() else dir.listFiles().mapNotNull { it.name }
    }

    AsyncFunction("copyIn") { path: String, localUri: Uri ->
      val file = find(path) ?: throw IllegalStateException("Not found in the sync folder: $path")
      val target = File(localUri.path!!)
      target.parentFile?.mkdirs()
      val input = context.contentResolver.openInputStream(file.uri)
        ?: throw IllegalStateException("Can't read from the sync folder: $path")
      input.use { source -> target.outputStream().use { source.copyTo(it) } }
    }

    AsyncFunction("copyOut") { localUri: Uri, path: String ->
      val parts = path.split("/").filter { it.isNotEmpty() }
      var dir = root()
      for (part in parts.dropLast(1)) {
        dir = dir.findFile(part)?.takeIf { it.isDirectory }
          ?: dir.createDirectory(part)
          ?: throw IllegalStateException("Can't create $part in the sync folder")
      }
      val name = parts.last()
      // "wt" truncates: the file is written over rather than deleted and made again, which
      // some providers turn into a copy under a new name.
      val uri = dir.findFile(name)?.uri
        ?: dir.createFile("application/octet-stream", name)?.uri
        ?: throw IllegalStateException("Can't create $name in the sync folder")
      val output = context.contentResolver.openOutputStream(uri, "wt")
        ?: throw IllegalStateException("Can't write to the sync folder: $path")
      output.use { sink -> File(localUri.path!!).inputStream().use { it.copyTo(sink) } }
    }

    AsyncFunction("remove") { path: String ->
      find(path)?.delete()
      Unit
    }
  }

  // Keeps the picked folder. When it holds no sync data yet, the data goes to a folder of
  // its own inside, so picking a drive's top folder does not litter it with files.
  private fun remember(picked: Uri): String {
    val previous = preferences.getString(TREE_KEY, null)
    context.contentResolver.takePersistableUriPermission(
      picked,
      Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
    )
    val tree = DocumentFile.fromTreeUri(context, picked)
      ?: throw IllegalStateException("The folder can't be opened")
    val subfolder = if (tree.findFile(MANIFEST_NAME) != null) "" else SUBFOLDER_NAME
    if (subfolder.isNotEmpty() && tree.findFile(subfolder) == null) {
      tree.createDirectory(subfolder) ?: throw IllegalStateException("Can't create a folder in the picked one")
    }
    if (previous != null && previous != picked.toString()) release(Uri.parse(previous))
    preferences.edit().putString(TREE_KEY, picked.toString()).putString(SUBFOLDER_KEY, subfolder).apply()
    return root().name ?: SUBFOLDER_NAME
  }

  private fun release(tree: Uri) {
    try {
      context.contentResolver.releasePersistableUriPermission(
        tree,
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
      )
    } catch (e: Exception) {
      // Already gone.
    }
  }

  // The sync folder; a folder that was deleted or whose access was taken back is an error.
  private fun root(): DocumentFile {
    val tree = preferences.getString(TREE_KEY, null) ?: throw IllegalStateException("No sync folder is chosen")
    val top = DocumentFile.fromTreeUri(context, Uri.parse(tree))
    if (top == null || !top.exists() || !top.canWrite()) {
      throw IllegalStateException("The sync folder can no longer be opened")
    }
    val subfolder = preferences.getString(SUBFOLDER_KEY, "") ?: ""
    if (subfolder.isEmpty()) return top
    return top.findFile(subfolder) ?: top.createDirectory(subfolder)
      ?: throw IllegalStateException("The sync folder can no longer be opened")
  }

  private fun find(path: String): DocumentFile? {
    var current = root()
    for (part in path.split("/").filter { it.isNotEmpty() }) {
      current = current.findFile(part) ?: return null
    }
    return current
  }
}
