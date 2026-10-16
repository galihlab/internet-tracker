package com.galih.kuotatracker.usagestats

import android.app.AppOpsManager
import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Modul native: baca pemakaian data asli dari Android via NetworkStatsManager.
 *
 * Syarat: aplikasi harus punya "Akses penggunaan" (PACKAGE_USAGE_STATS),
 * yang diaktifkan manual oleh user di Settings. Tanpa itu, semua query
 * melempar SecurityException dan JS jatuh ke data contoh.
 */
@Suppress("DEPRECATION")
class UsageStatsModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("ReactContext tidak tersedia")

  private fun networkStatsManager(): NetworkStatsManager {
    return context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager
  }

  private fun hasUsageAccess(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      context.packageName
    )
    return mode == AppOpsManager.MODE_ALLOWED
  }

  override fun definition() = ModuleDefinition {
    Name("UsageStats")

    AsyncFunction("hasUsageAccess") {
      hasUsageAccess()
    }

    Function("openUsageAccessSettings") {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("getDeviceUsage") { start: Long, end: Long ->
      val stats = networkStatsManager()
      val mobile = stats.querySummaryForDevice(ConnectivityManager.TYPE_MOBILE, null, start, end)
      val wifi = stats.querySummaryForDevice(ConnectivityManager.TYPE_WIFI, null, start, end)
      mapOf(
        "mobileBytes" to (mobile.rxBytes + mobile.txBytes),
        "wifiBytes" to (wifi.rxBytes + wifi.txBytes)
      )
    }

    AsyncFunction("getAppUsage") { start: Long, end: Long, limit: Int ->
      val stats = networkStatsManager()
      val pm = context.packageManager
      val perPackage = HashMap<String, Long>()

      fun accumulate(networkType: Int) {
        val networkStats: NetworkStats = stats.querySummary(networkType, null, start, end)
        try {
          val bucket = NetworkStats.Bucket()
          while (networkStats.hasNextBucket()) {
            networkStats.getNextBucket(bucket)
            val bytes = bucket.rxBytes + bucket.txBytes
            if (bytes <= 0) continue
            val packages = pm.getPackagesForUid(bucket.uid) ?: continue
            for (pkg in packages) {
              perPackage[pkg] = (perPackage[pkg] ?: 0L) + bytes
            }
          }
        } finally {
          networkStats.close()
        }
      }

      accumulate(ConnectivityManager.TYPE_MOBILE)
      accumulate(ConnectivityManager.TYPE_WIFI)

      perPackage.entries
        .sortedByDescending { it.value }
        .take(limit)
        .map { (pkg, bytes) ->
          val label = try {
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
          } catch (_: PackageManager.NameNotFoundException) {
            pkg
          }
          mapOf(
            "packageName" to pkg,
            "label" to label,
            "bytes" to bytes
          )
        }
    }
  }
}
