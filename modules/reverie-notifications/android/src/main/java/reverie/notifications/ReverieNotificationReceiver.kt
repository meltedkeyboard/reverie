package reverie.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput

class ReverieNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ReverieNotificationsStore.ACTION_ALARM -> {
        val id = intent.getStringExtra(ReverieNotificationsStore.EXTRA_ID) ?: return
        val spec = ReverieNotificationsStore.getAndRemoveScheduledSpec(context, id) ?: return
        ReverieNotificationsStore.showNow(context, spec)
      }
      ReverieNotificationsStore.ACTION_REPLY,
      ReverieNotificationsStore.ACTION_CONTINUE -> {
        val id = intent.getStringExtra(ReverieNotificationsStore.EXTRA_ID) ?: ""
        val actionId = intent.getStringExtra(ReverieNotificationsStore.EXTRA_ACTION) ?: "default"
        val route = intent.getStringExtra(ReverieNotificationsStore.EXTRA_ROUTE)
        val kind = intent.getStringExtra(ReverieNotificationsStore.EXTRA_KIND)
        val metaJson = intent.getStringExtra(ReverieNotificationsStore.EXTRA_META)
        val replyText = if (intent.action == ReverieNotificationsStore.ACTION_REPLY) {
          RemoteInput.getResultsFromIntent(intent)
            ?.getCharSequence(ReverieNotificationsStore.REMOTE_INPUT_KEY)
            ?.toString()
        } else {
          null
        }

        if (id.isNotEmpty()) {
          NotificationManagerCompat.from(context).cancel(id.hashCode())
        }

        val event = mutableMapOf<String, Any?>(
          "id" to id,
          "actionId" to actionId
        )
        if (route != null) event["route"] = route
        if (kind != null) event["kind"] = kind
        if (replyText != null) event["replyText"] = replyText
        if (metaJson != null) {
          ReverieNotificationsStore.parseMeta(metaJson)?.let { event["meta"] = it }
        }

        if (ReverieNotificationsStore.hasActiveModule()) {
          ReverieNotificationsStore.emitOrBufferAction(event)
        } else {
          ReverieNotificationsStore.emitOrBufferAction(event)
          ReverieNotificationsStore.buildLaunchIntent(
            context = context,
            id = id,
            actionId = actionId,
            route = route,
            kind = kind,
            metaJson = metaJson,
            replyText = replyText
          )?.let { launch ->
            context.startActivity(launch)
          }
        }
      }
    }
  }
}
