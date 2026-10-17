package com.galih.kuotatracker.usagestats

import android.app.AppOpsManager
import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.ConnectivityManager
import android.os.Process
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

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

  // Format tanggal lokal perangkat: 'YYYY-MM-DD', sama dengan dateISO di JS.
  private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

  // Awal hari kalender (tengah malam lokal) untuk sebuah epoch millis.
  private fun startOfDay(millis: Long): Long {
    val cal = Calendar.getInstance()
    cal.timeInMillis = millis
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    return cal.timeInMillis
  }

  // Ikon launcher satu aplikasi (T3.1): dirender ke bitmap 96x96 lalu
  // di-encode PNG Base64. Drawable adaptif digambar dengan bounds
  // eksplisit supaya tidak bergantung pada ukuran intrinsiknya (-1 untuk
  // ikon adaptif). Mengembalikan null bila ikon tidak bisa dibaca —
  // pemanggil JS menampilkan ikon generik, bukan logo palsu.
  private fun drawableKeBase64(drawable: Drawable): String? {
    return try {
      val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      if (drawable is BitmapDrawable && drawable.bitmap != null) {
        canvas.drawBitmap(
          Bitmap.createScaledBitmap(drawable.bitmap, 96, 96, true),
          0f,
          0f,
          null
        )
      } else {
        drawable.setBounds(0, 0, 96, 96)
        drawable.draw(canvas)
      }
      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
      Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    } catch (_: Exception) {
      null
    }
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

    // Bucket harian (T2.2): satu entri per hari kalender pada [start, end).
    // Hari terakhir dipotong di `end` sehingga bucket hari ini bersifat
    // parsial (sejak tengah malam sampai sekarang) — JS membedakan hari
    // penuh (tanggal < hari ini) dari hari berjalan lewat tanggalnya.
    AsyncFunction("getDailyBuckets") { start: Long, end: Long ->
      val stats = networkStatsManager()
      val hasil = ArrayList<Map<String, Any>>()
      var dayStart = startOfDay(start)
      while (dayStart < end) {
        val dayEnd = minOf(dayStart + 24 * 60 * 60 * 1000L, end)
        val mobile = stats.querySummaryForDevice(ConnectivityManager.TYPE_MOBILE, null, dayStart, dayEnd)
        val wifi = stats.querySummaryForDevice(ConnectivityManager.TYPE_WIFI, null, dayStart, dayEnd)
        hasil.add(
          mapOf(
            "dateISO" to dateFormat.format(Date(dayStart)),
            "mobileBytes" to (mobile.rxBytes + mobile.txBytes),
            "wifiBytes" to (wifi.rxBytes + wifi.txBytes)
          )
        )
        dayStart += 24 * 60 * 60 * 1000L
      }
      hasil
    }

    // Bucket per aplikasi per hari (T2.2 + T3.3): satu entri per
    // (aplikasi, hari), dipecah seluler vs Wi-Fi. Satu bucket UID hanya
    // diatribusikan ke SATU nama paket — paket pertama menurut urutan
    // abjad, supaya deterministik — karena satu UID bisa dimiliki
    // bersama beberapa paket dan menghitungnya untuk semua paket akan
    // menggandakan angka (jumlah daftar melebihi total perangkat).
    // Ini perkiraan yang didokumentasikan: untuk UID bersama, seluruh
    // pemakaian UID itu tampil pada satu paket perwakilannya.
    AsyncFunction("getDailyAppBuckets") { start: Long, end: Long, limit: Int ->
      val stats = networkStatsManager()
      val pm = context.packageManager
      // (namaPaket, tanggal) -> (seluler, wifi)
      val perHari = HashMap<Pair<String, String>, Pair<Long, Long>>()
      val totalPerPaket = HashMap<String, Long>()

      fun accumulate(networkType: Int, dayStart: Long, dayEnd: Long, dateISO: String, seluler: Boolean) {
        val networkStats: NetworkStats = stats.querySummary(networkType, null, dayStart, dayEnd)
        try {
          val bucket = NetworkStats.Bucket()
          while (networkStats.hasNextBucket()) {
            networkStats.getNextBucket(bucket)
            val bytes = bucket.rxBytes + bucket.txBytes
            if (bytes <= 0) continue
            val packages = pm.getPackagesForUid(bucket.uid) ?: continue
            val pkg = packages.sorted().first()
            val kunci = pkg to dateISO
            val lama = perHari[kunci] ?: (0L to 0L)
            perHari[kunci] = if (seluler) {
              (lama.first + bytes) to lama.second
            } else {
              lama.first to (lama.second + bytes)
            }
            totalPerPaket[pkg] = (totalPerPaket[pkg] ?: 0L) + bytes
          }
        } finally {
          networkStats.close()
        }
      }

      var dayStart = startOfDay(start)
      while (dayStart < end) {
        val dayEnd = minOf(dayStart + 24 * 60 * 60 * 1000L, end)
        val dateISO = dateFormat.format(Date(dayStart))
        accumulate(ConnectivityManager.TYPE_MOBILE, dayStart, dayEnd, dateISO, true)
        accumulate(ConnectivityManager.TYPE_WIFI, dayStart, dayEnd, dateISO, false)
        dayStart += 24 * 60 * 60 * 1000L
      }

      val teratas = totalPerPaket.entries
        .sortedByDescending { it.value }
        .take(limit.coerceIn(1, 50))
        .map { it.key }
        .toSet()

      perHari.entries
        .filter { (kunci, _) -> kunci.first in teratas }
        .sortedWith(compareBy({ it.key.second }, { it.key.first }))
        .map { (kunci, split) ->
          val label = try {
            pm.getApplicationLabel(pm.getApplicationInfo(kunci.first, 0)).toString()
          } catch (_: PackageManager.NameNotFoundException) {
            kunci.first
          }
          mapOf(
            "packageName" to kunci.first,
            "label" to label,
            "dateISO" to kunci.second,
            "bytes" to (split.first + split.second),
            "mobileBytes" to split.first,
            "wifiBytes" to split.second
          )
        }
    }

    AsyncFunction("getAppIcons") { packages: List<String> ->
      val pm = context.packageManager
      packages.distinct().map { pkg ->
        try {
          val info = pm.getApplicationInfo(pkg, 0)
          val label = pm.getApplicationLabel(info).toString()
          val ikon = try {
            drawableKeBase64(pm.getApplicationIcon(info))
          } catch (_: PackageManager.NameNotFoundException) {
            null
          }
          mapOf(
            "packageName" to pkg,
            "label" to label,
            // Expo Modules memetakan null Kotlin ke null JS.
            "iconBase64" to ikon,
          )
        } catch (_: PackageManager.NameNotFoundException) {
          // Aplikasi sudah di-uninstall: tanpa ikon, label = nama paket.
          // JS mengganti label dengan label terakhir yang tercatat.
          mapOf(
            "packageName" to pkg,
            "label" to pkg,
            "iconBase64" to null,
          )
        }
      }
    }

    // Pemakaian per aplikasi (T3.3): dipecah seluler vs Wi-Fi, satu
    // bucket UID hanya untuk satu paket perwakilan (lihat
    // getDailyAppBuckets) supaya jumlah daftar tidak melebihi total
    // perangkat karena UID bersama.
    AsyncFunction("getAppUsage") { start: Long, end: Long, limit: Int ->
      val stats = networkStatsManager()
      val pm = context.packageManager
      val perPackageMobile = HashMap<String, Long>()
      val perPackageWifi = HashMap<String, Long>()

      fun accumulate(networkType: Int, seluler: Boolean) {
        val networkStats: NetworkStats = stats.querySummary(networkType, null, start, end)
        try {
          val bucket = NetworkStats.Bucket()
          while (networkStats.hasNextBucket()) {
            networkStats.getNextBucket(bucket)
            val bytes = bucket.rxBytes + bucket.txBytes
            if (bytes <= 0) continue
            val packages = pm.getPackagesForUid(bucket.uid) ?: continue
            val pkg = packages.sorted().first()
            if (seluler) {
              perPackageMobile[pkg] = (perPackageMobile[pkg] ?: 0L) + bytes
            } else {
              perPackageWifi[pkg] = (perPackageWifi[pkg] ?: 0L) + bytes
            }
          }
        } finally {
          networkStats.close()
        }
      }

      accumulate(ConnectivityManager.TYPE_MOBILE, true)
      accumulate(ConnectivityManager.TYPE_WIFI, false)

      (perPackageMobile.keys + perPackageWifi.keys)
        .map { pkg ->
          val mobile = perPackageMobile[pkg] ?: 0L
          val wifi = perPackageWifi[pkg] ?: 0L
          Triple(pkg, mobile, wifi)
        }
        .sortedByDescending { it.second + it.third }
        .take(limit)
        .map { (pkg, mobile, wifi) ->
          val label = try {
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
          } catch (_: PackageManager.NameNotFoundException) {
            pkg
          }
          mapOf(
            "packageName" to pkg,
            "label" to label,
            "bytes" to (mobile + wifi),
            "mobileBytes" to mobile,
            "wifiBytes" to wifi
          )
        }
    }
  }
}
