package reverie.notifications

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference

internal object ReverieNotificationsStore {
  const val ACTION_ALARM = "reverie.notifications.ALARM"
  const val ACTION_CLICK = "reverie.notifications.CLICK"
  const val ACTION_REPLY = "reverie.notifications.REPLY"
  const val ACTION_CONTINUE = "reverie.notifications.CONTINUE"
  const val ACTION_RETRY = "reverie.notifications.RETRY"

  const val EXTRA_ID = "reverie_notif_id"
  const val EXTRA_ACTION = "reverie_action_id"
  const val EXTRA_ROUTE = "reverie_route"
  const val EXTRA_KIND = "reverie_kind"
  const val EXTRA_META = "reverie_meta"
  const val EXTRA_REPLY = "reverie_reply_text"
  const val REMOTE_INPUT_KEY = "reply_text"

  private const val PREFS_NAME = "reverie.notifications"
  private const val KEY_SCHEDULED = "scheduled"
  private const val KEY_LABELS = "category_labels"
  private const val KEY_CHANNELS = "channel_labels"

  @Volatile
  var activeRoute: String? = null

  @Volatile
  var isAppInForeground: Boolean = false

  private var moduleRef: WeakReference<ReverieNotificationsModule>? = null
  private val pendingEvents = mutableListOf<Map<String, Any?>>()

  fun attachModule(module: ReverieNotificationsModule) {
    moduleRef = WeakReference(module)
  }

  fun detachModule(module: ReverieNotificationsModule) {
    if (moduleRef?.get() === module) {
      moduleRef = null
    }
  }

  fun hasActiveModule(): Boolean = moduleRef?.get() != null

  fun emitOrBufferAction(event: Map<String, Any?>) {
    val mod = moduleRef?.get()
    if (mod != null) {
      mod.dispatchAction(event)
      return
    }
    synchronized(pendingEvents) {
      pendingEvents.add(event)
    }
  }

  fun consumePendingEvents(): List<Map<String, Any?>> {
    synchronized(pendingEvents) {
      if (pendingEvents.isEmpty()) return emptyList()
      val copy = pendingEvents.toList()
      pendingEvents.clear()
      return copy
    }
  }

  fun saveCategoryLabels(context: Context, labels: Map<String, String>) {
    val json = JSONObject()
    labels.forEach { (k, v) -> json.put(k, v) }
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_LABELS, json.toString())
      .apply()
  }

  fun saveChannelLabels(context: Context, labels: Map<String, String>) {
    val json = JSONObject()
    labels.forEach { (k, v) -> json.put(k, v) }
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_CHANNELS, json.toString())
      .apply()
    ensureChannels(context)
  }

  private fun readCategoryLabels(context: Context): JSONObject {
    val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_LABELS, null)
    return if (raw != null) JSONObject(raw) else JSONObject()
  }

  private fun readChannelLabels(context: Context): JSONObject {
    val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_CHANNELS, null)
    return if (raw != null) JSONObject(raw) else JSONObject()
  }

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val labels = readChannelLabels(context)
    val specs = listOf(
      Triple("replies", labels.optString("replies", "Replies"), NotificationManager.IMPORTANCE_HIGH),
      Triple("rooms", labels.optString("rooms", "Rooms"), NotificationManager.IMPORTANCE_HIGH),
      Triple("reminders", labels.optString("reminders", "Reminders"), NotificationManager.IMPORTANCE_HIGH),
      Triple("background", labels.optString("background", "Background tasks"), NotificationManager.IMPORTANCE_DEFAULT),
    )
    for ((id, name, importance) in specs) {
      val channel = NotificationChannel(id, name, importance)
      manager.createNotificationChannel(channel)
    }
  }

  fun scheduleSpec(context: Context, spec: JSONObject) {
    ensureChannels(context)
    val id = spec.optString("id")
    if (id.isEmpty()) return

    val now = System.currentTimeMillis()
    val fireAtMs = when {
      spec.has("fireAtMs") && !spec.isNull("fireAtMs") -> spec.optLong("fireAtMs")
      spec.has("delaySeconds") && !spec.isNull("delaySeconds") -> now + (spec.optDouble("delaySeconds", 0.0) * 1000.0).toLong()
      else -> 0L
    }

    if (fireAtMs <= now + 500L) {
      showNow(context, spec)
      return
    }

    spec.put("fireAtMs", fireAtMs)
    saveScheduledSpec(context, id, spec)
    armAlarm(context, id, fireAtMs)
  }

  fun armAlarm(context: Context, id: String, fireAtMs: Long) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val intent = Intent(context, ReverieNotificationReceiver::class.java).apply {
      action = ACTION_ALARM
      putExtra(EXTRA_ID, id)
    }
    val pi = PendingIntent.getBroadcast(
      context,
      id.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMs, pi)
  }

  fun cancel(context: Context, id: String) {
    cancelAlarm(context, id)
    removeScheduledSpec(context, id)
    NotificationManagerCompat.from(context).cancel(id.hashCode())
  }

  fun cancelByTag(context: Context, tag: String) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val all = readScheduledMap(prefs.getString(KEY_SCHEDULED, null))
    val removed = mutableListOf<String>()
    for ((id, spec) in all) {
      if (spec.optString("tag") == tag) {
        removed.add(id)
      }
    }
    for (id in removed) {
      cancelAlarm(context, id)
      all.remove(id)
      NotificationManagerCompat.from(context).cancel(id.hashCode())
    }
    writeScheduledMap(prefs, all)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      for (active in manager.activeNotifications) {
        if (active.tag == tag) {
          manager.cancel(tag, active.id)
        }
      }
    }
  }

  fun cancelAll(context: Context) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val all = readScheduledMap(prefs.getString(KEY_SCHEDULED, null))
    for (id in all.keys) {
      cancelAlarm(context, id)
    }
    prefs.edit().remove(KEY_SCHEDULED).apply()
    NotificationManagerCompat.from(context).cancelAll()
  }

  fun listScheduled(context: Context): List<Map<String, Any?>> {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val all = readScheduledMap(prefs.getString(KEY_SCHEDULED, null))
    val now = System.currentTimeMillis()
    return all.values
      .filter { it.optLong("fireAtMs", 0L) >= now - 5000L }
      .map { spec ->
        val item = mutableMapOf<String, Any?>("id" to spec.optString("id"))
        val tag = spec.optString("tag")
        if (tag.isNotEmpty()) item["tag"] = tag
        if (spec.has("fireAtMs")) item["fireAtMs"] = spec.optLong("fireAtMs").toDouble()
        item
      }
  }

  fun restoreAlarmsOnBoot(context: Context) {
    ensureChannels(context)
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val all = readScheduledMap(prefs.getString(KEY_SCHEDULED, null))
    val now = System.currentTimeMillis()
    val kept = mutableMapOf<String, JSONObject>()
    for ((id, spec) in all) {
      val fireAtMs = spec.optLong("fireAtMs", 0L)
      if (fireAtMs <= 0L) continue
      if (fireAtMs <= now) {
        showNow(context, spec)
      } else {
        kept[id] = spec
        armAlarm(context, id, fireAtMs)
      }
    }
    writeScheduledMap(prefs, kept)
  }

  fun getAndRemoveScheduledSpec(context: Context, id: String): JSONObject? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val all = readScheduledMap(prefs.getString(KEY_SCHEDULED, null))
    val spec = all.remove(id)
    writeScheduledMap(prefs, all)
    return spec
  }

  fun showNow(context: Context, spec: JSONObject) {
    ensureChannels(context)
    val id = spec.optString("id")
    if (id.isEmpty()) return

    val presentInForeground = spec.optBoolean("presentInForeground", false)
    val route = spec.optString("route").takeIf { it.isNotEmpty() }
    if (isAppInForeground) {
      if (!presentInForeground) return
      if (route != null && route == activeRoute) return
    }

    val channel = spec.optString("channel", "replies").ifEmpty { "replies" }
    val title = spec.optString("title", "")
    val subtitle = spec.optString("subtitle").takeIf { it.isNotEmpty() }
    val body = spec.optString("body", "")
    val soundOn = spec.optBoolean("sound", true)
    val category = spec.optString("category", "default")
    val kind = spec.optString("kind").takeIf { it.isNotEmpty() }
    val tag = spec.optString("tag").takeIf { it.isNotEmpty() }
    val threadId = spec.optString("threadId").takeIf { it.isNotEmpty() }
    val senderName = spec.optString("senderName").takeIf { it.isNotEmpty() }
    val isGroup = spec.optBoolean("isGroup", false)
    val avatarPath = spec.optString("avatarPath").takeIf { it.isNotEmpty() }
    val avatarStyle = spec.optString("avatarStyle", "none")
    val metaJson = spec.optJSONObject("meta")?.toString()

    val contentPi = buildOpenPendingIntent(
      context = context,
      id = id,
      actionId = "default",
      route = route,
      kind = kind,
      metaJson = metaJson,
      requestCode = (id + ":default").hashCode()
    )

    val smallIcon = context.applicationInfo.icon
    val builder = NotificationCompat.Builder(context, channel)
      .setSmallIcon(smallIcon)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setContentIntent(contentPi)
      .setPriority(NotificationCompat.PRIORITY_HIGH)

    if (subtitle != null) {
      builder.setSubText(subtitle)
    }
    if (!soundOn) {
      builder.setSilent(true)
    }
    if (threadId != null) {
      builder.setGroup(threadId)
    }

    val avatarBitmap = if (avatarStyle != "none" && avatarPath != null) loadCircularBitmap(avatarPath) else null
    if (avatarBitmap != null) {
      builder.setLargeIcon(avatarBitmap)
    }

    if (avatarStyle == "communication" && senderName != null) {
      val personBuilder = Person.Builder().setName(senderName)
      if (avatarBitmap != null) {
        personBuilder.setIcon(IconCompat.createWithBitmap(avatarBitmap))
      }
      val person = personBuilder.build()
      val style = NotificationCompat.MessagingStyle(person)
      if (isGroup) {
        style.setConversationTitle(title)
        style.setGroupConversation(true)
      }
      style.addMessage(body, System.currentTimeMillis(), person)
      builder.setStyle(style)
    } else if (body.length > 48) {
      builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
    }

    val labels = readCategoryLabels(context)
    if (category == "chat_reply" || category == "room_reply") {
      val replyLabel = labels.optString("replyTitle", "Reply")
      val placeholder = labels.optString("replyPlaceholder", "Message...")
      val continueLabel = labels.optString("continueTitle", "Continue")

      val remoteInput = RemoteInput.Builder(REMOTE_INPUT_KEY)
        .setLabel(placeholder)
        .build()
      val replyIntent = Intent(context, ReverieNotificationReceiver::class.java).apply {
        action = ACTION_REPLY
        putExtra(EXTRA_ID, id)
        putExtra(EXTRA_ACTION, "REPLY")
        if (route != null) putExtra(EXTRA_ROUTE, route)
        if (kind != null) putExtra(EXTRA_KIND, kind)
        if (metaJson != null) putExtra(EXTRA_META, metaJson)
      }
      val replyFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
      val replyPi = PendingIntent.getBroadcast(context, (id + ":REPLY").hashCode(), replyIntent, replyFlags)
      val replyAction = NotificationCompat.Action.Builder(0, replyLabel, replyPi)
        .addRemoteInput(remoteInput)
        .setAllowGeneratedReplies(false)
        .build()
      builder.addAction(replyAction)

      if (continueLabel.isNotEmpty()) {
        val continueIntent = Intent(context, ReverieNotificationReceiver::class.java).apply {
          action = ACTION_CONTINUE
          putExtra(EXTRA_ID, id)
          putExtra(EXTRA_ACTION, "CONTINUE")
          if (route != null) putExtra(EXTRA_ROUTE, route)
          if (kind != null) putExtra(EXTRA_KIND, kind)
          if (metaJson != null) putExtra(EXTRA_META, metaJson)
        }
        val continuePi = PendingIntent.getBroadcast(
          context,
          (id + ":CONTINUE").hashCode(),
          continueIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        builder.addAction(0, continueLabel, continuePi)
      }
    } else if (category == "stream_error") {
      val retryLabel = labels.optString("retryTitle", "Retry")
      val retryPi = buildOpenPendingIntent(
        context = context,
        id = id,
        actionId = "RETRY",
        route = route,
        kind = kind,
        metaJson = metaJson,
        requestCode = (id + ":RETRY").hashCode()
      )
      builder.addAction(0, retryLabel, retryPi)
    }

    try {
      NotificationManagerCompat.from(context).notify(tag, id.hashCode(), builder.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS was revoked by the user.
    }
  }

  fun buildLaunchIntent(
    context: Context,
    id: String,
    actionId: String,
    route: String?,
    kind: String?,
    metaJson: String?,
    replyText: String? = null
  ): Intent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
    if (route != null) {
      launch.data = Uri.parse("reverie://" + route.trimStart('/'))
      launch.putExtra(EXTRA_ROUTE, route)
    }
    launch.putExtra(EXTRA_ID, id)
    launch.putExtra(EXTRA_ACTION, actionId)
    if (kind != null) launch.putExtra(EXTRA_KIND, kind)
    if (metaJson != null) launch.putExtra(EXTRA_META, metaJson)
    if (replyText != null) launch.putExtra(EXTRA_REPLY, replyText)
    return launch
  }

  private fun buildOpenPendingIntent(
    context: Context,
    id: String,
    actionId: String,
    route: String?,
    kind: String?,
    metaJson: String?,
    requestCode: Int
  ): PendingIntent {
    val launch = buildLaunchIntent(context, id, actionId, route, kind, metaJson)
      ?: Intent(context, ReverieNotificationReceiver::class.java).apply {
        action = ACTION_CLICK
        putExtra(EXTRA_ID, id)
        putExtra(EXTRA_ACTION, actionId)
      }
    return PendingIntent.getActivity(
      context,
      requestCode,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun extractEventFromIntent(intent: Intent?): Map<String, Any?>? {
    if (intent == null) return null
    val actionId = intent.getStringExtra(EXTRA_ACTION) ?: return null
    val id = intent.getStringExtra(EXTRA_ID) ?: ""
    val event = mutableMapOf<String, Any?>(
      "id" to id,
      "actionId" to actionId
    )
    intent.getStringExtra(EXTRA_ROUTE)?.let { event["route"] = it }
    intent.getStringExtra(EXTRA_KIND)?.let { event["kind"] = it }
    intent.getStringExtra(EXTRA_REPLY)?.let { event["replyText"] = it }
    intent.getStringExtra(EXTRA_META)?.let { raw ->
      parseMeta(raw)?.let { event["meta"] = it }
    }
    intent.removeExtra(EXTRA_ACTION)
    return event
  }

  fun parseMeta(raw: String): Map<String, Any?>? {
    return try {
      val obj = JSONObject(raw)
      val map = mutableMapOf<String, Any?>()
      val keys = obj.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        map[key] = obj.get(key)
      }
      map
    } catch (_: Exception) {
      null
    }
  }

  private fun cancelAlarm(context: Context, id: String) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val intent = Intent(context, ReverieNotificationReceiver::class.java).apply {
      action = ACTION_ALARM
      putExtra(EXTRA_ID, id)
    }
    val pi = PendingIntent.getBroadcast(
      context,
      id.hashCode(),
      intent,
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
    )
    if (pi != null) {
      alarmManager.cancel(pi)
      pi.cancel()
    }
  }

  private fun saveScheduledSpec(context: Context, id: String, spec: JSONObject) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val all = readScheduledMap(prefs.getString(KEY_SCHEDULED, null))
    all[id] = spec
    writeScheduledMap(prefs, all)
  }

  private fun removeScheduledSpec(context: Context, id: String) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val all = readScheduledMap(prefs.getString(KEY_SCHEDULED, null))
    if (all.remove(id) != null) {
      writeScheduledMap(prefs, all)
    }
  }

  private fun readScheduledMap(raw: String?): MutableMap<String, JSONObject> {
    val map = mutableMapOf<String, JSONObject>()
    if (raw.isNullOrEmpty()) return map
    return try {
      val array = JSONArray(raw)
      for (i in 0 until array.length()) {
        val obj = array.optJSONObject(i) ?: continue
        val id = obj.optString("id")
        if (id.isNotEmpty()) map[id] = obj
      }
      map
    } catch (_: Exception) {
      map
    }
  }

  private fun writeScheduledMap(prefs: android.content.SharedPreferences, map: Map<String, JSONObject>) {
    val array = JSONArray()
    map.values.forEach { array.put(it) }
    prefs.edit().putString(KEY_SCHEDULED, array.toString()).apply()
  }

  private fun loadCircularBitmap(rawPath: String): Bitmap? {
    val path = if (rawPath.startsWith("file://")) Uri.parse(rawPath).path ?: rawPath else rawPath
    val file = File(path)
    if (!file.exists()) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    var sample = 1
    while (bounds.outWidth / sample > 256 || bounds.outHeight / sample > 256) {
      sample *= 2
    }
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val decoded = BitmapFactory.decodeFile(file.absolutePath, opts) ?: return null
    val size = minOf(decoded.width, decoded.height)
    if (size <= 0) return decoded
    val x = (decoded.width - size) / 2
    val y = (decoded.height - size) / 2
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val radius = size / 2f
    canvas.drawCircle(radius, radius, radius, paint)
    paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
    canvas.drawBitmap(decoded, Rect(x, y, x + size, y + size), Rect(0, 0, size, size), paint)
    if (decoded !== out) decoded.recycle()
    return out
  }
}
