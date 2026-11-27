package reverie.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ReverieBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      ReverieNotificationsStore.restoreAlarmsOnBoot(context)
    }
  }
}
