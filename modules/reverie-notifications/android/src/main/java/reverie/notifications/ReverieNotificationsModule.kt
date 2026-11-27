package reverie.notifications

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

class ReverieNotificationsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ReverieNotifications")

    Events("onNotificationAction", "onBackgroundExpiring")

    OnCreate {
      ReverieNotificationsStore.attachModule(this@ReverieNotificationsModule)
      ReverieNotificationsStore.ensureChannels(context)
      ReverieNotificationsStore.isAppInForeground = true
      appContext.currentActivity?.intent?.let { intent ->
        ReverieNotificationsStore.extractEventFromIntent(intent)?.let { event ->
          ReverieNotificationsStore.emitOrBufferAction(event)
        }
      }
    }

    OnDestroy {
      ReverieNotificationsStore.detachModule(this@ReverieNotificationsModule)
    }

    OnActivityEntersForeground {
      ReverieNotificationsStore.isAppInForeground = true
    }

    OnActivityEntersBackground {
      ReverieNotificationsStore.isAppInForeground = false
    }

    OnNewIntent { intent ->
      ReverieNotificationsStore.extractEventFromIntent(intent)?.let { event ->
        dispatchAction(event)
      }
    }

    AsyncFunction("getPermissionStatus") {
      permissionStatusNow()
    }

    AsyncFunction("requestPermission") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.resolve(permissionStatusNow())
        return@AsyncFunction
      }
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve(permissionStatusNow())
        return@AsyncFunction
      }
      if (permissions.hasGrantedPermissions(Manifest.permission.POST_NOTIFICATIONS)) {
        promise.resolve("granted")
        return@AsyncFunction
      }
      permissions.askForPermissions(
        PermissionsResponseListener { responses ->
          val res = responses[Manifest.permission.POST_NOTIFICATIONS]
          if (res?.status == PermissionsStatus.GRANTED) {
            promise.resolve("granted")
          } else {
            promise.resolve("denied")
          }
        },
        Manifest.permission.POST_NOTIFICATIONS
      )
    }

    AsyncFunction("openSystemSettings") {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
          putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        }
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.fromParts("package", context.packageName, null)
        }
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("configureCategories") { labels: Map<String, String> ->
      ReverieNotificationsStore.saveCategoryLabels(context, labels)
    }

    Function("configureChannels") { labels: Map<String, String> ->
      ReverieNotificationsStore.saveChannelLabels(context, labels)
    }

    Function("setActiveRoute") { route: String? ->
      ReverieNotificationsStore.activeRoute = route
    }

    AsyncFunction("schedule") { payload: Map<String, Any?> ->
      ReverieNotificationsStore.scheduleSpec(context, toJsonObject(payload))
    }

    AsyncFunction("cancel") { id: String ->
      ReverieNotificationsStore.cancel(context, id)
    }

    AsyncFunction("cancelByTag") { tag: String ->
      ReverieNotificationsStore.cancelByTag(context, tag)
    }

    AsyncFunction("cancelAll") {
      ReverieNotificationsStore.cancelAll(context)
    }

    AsyncFunction("listScheduled") {
      ReverieNotificationsStore.listScheduled(context)
    }

    Function("consumePendingEvents") {
      ReverieNotificationsStore.consumePendingEvents()
    }

    AsyncFunction("beginBackgroundTask") { _: String ->
      0
    }

    Function("endBackgroundTask") { _: Int ->
    }
  }

  fun dispatchAction(event: Map<String, Any?>) {
    sendEvent("onNotificationAction", event)
  }

  private fun permissionStatusNow(): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val permissions = appContext.permissions
      if (permissions != null) {
        return if (permissions.hasGrantedPermissions(Manifest.permission.POST_NOTIFICATIONS)) "granted" else "undetermined"
      }
    }
    return if (NotificationManagerCompat.from(context).areNotificationsEnabled()) "granted" else "denied"
  }

  private fun toJsonObject(map: Map<String, Any?>): JSONObject {
    val obj = JSONObject()
    for ((k, v) in map) {
      obj.put(k, toJsonValue(v))
    }
    return obj
  }

  private fun toJsonValue(value: Any?): Any? {
    return when (value) {
      null -> JSONObject.NULL
      is Map<*, *> -> {
        val nested = JSONObject()
        for ((k, v) in value) {
          if (k is String) nested.put(k, toJsonValue(v))
        }
        nested
      }
      is List<*> -> {
        val arr = JSONArray()
        value.forEach { arr.put(toJsonValue(it)) }
        arr
      }
      else -> value
    }
  }
}
