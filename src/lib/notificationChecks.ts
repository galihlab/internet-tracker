// Orkestrasi pemeriksaan notifikasi (T4.2) — satu jalur yang dipakai
// pemeriksaan saat aplikasi dibuka (UsageProvider) DAN tugas latar
// terjadwal (notificationTask.ts). Pemanggil menyediakan data yang
// sudah dimuat; fungsi ini hanya memutuskan + menulis + mengirim.
//
// Jaminan yang dipertahankan di sini:
//
// - Hanya data SEGAR ASLI (source 'native', bukan snapshot/contoh/
//   kosong) yang boleh memicu notifikasi — data contoh di Expo Go
//   (6 GB/hari) akan langsung melewati semua ambang bila dipakai.
// - Satu kejadian = satu entri peringatan + satu upaya pengiriman.
//   Dedup memakai kunci di notificationState; entri peringatan di
//   alerts.ts adalah catatan durable-nya (T4.3: satu sumber). Bila
//   pengiriman gagal (mis. izin belum diberikan), entri tetap ada dan
//   TIDAK dikirim ulang — pengiriman adalah ping best-effort untuk
//   entri, bukan sumber kebenarannya. Ini mencegah spam saat izin
//   diberikan belakangan.
// - Ringkasan harian TIDAK membuat entri peringatan (daftar /alerts
//   hanya berisi lonjakan, ambang, dan prediksi kritis) dan hanya
//   ditandai terkirim bila benar-benar terkirim — bila gagal, dicoba
//   lagi pada pemeriksaan berikutnya.

import { sqliteStore } from './db';
import { addAlertEntries } from './alerts';
import { computeQuota, type QuotaPackage } from './quota';
import type { DailyBucket } from '../../modules/usage-stats';
import {
  dailySummaryContent,
  detectCriticalForecast,
  detectDailyInternetBudget,
  detectOvernightUsage,
  detectPerAppBudgets,
  detectThresholdCrossings,
  overnightWindowFor,
  shouldSendDailySummary,
  type NotificationFinding,
} from './notifications';
import {
  claimFiredKey,
  loadNotificationState,
  markDailySummarySent,
} from './notificationState';
import { sendLocalNotification } from './notify';
import type { StoredSettings } from './storage';
import { loadSettings } from './storage';
import {
  getDeviceUsageForRange,
  getUsageSummaryForRange,
  type UsageSummary,
} from './usageStats';
import { refreshDailyBuckets } from './dailyBuckets';
import { dateISOOf, packageWindow } from './windows';

/** Pemakaian hari ini untuk pemeriksaan notifikasi (seluler + Wi-Fi + per aplikasi). */
export type NotificationDailyData = {
  /** Seluler hari ini. */
  todayMobileBytes: number;
  /** Wi-Fi hari ini. */
  todayWifiBytes: number;
  /** Pemakaian per aplikasi hari ini (total seluler + Wi-Fi tiap aplikasi). */
  perAppToday: { packageName: string; label: string; bytes: number }[];
  /** Sumber data harian: 'native' = angka asli, selain itu tidak boleh memicu. */
  source: 'native' | 'sample' | 'snapshot' | 'empty';
  /** True bila data harian berasal dari snapshot tersimpan. */
  fromSnapshot: boolean;
};

export type NotificationCheckData = {
  settings: StoredSettings;
  /**
   * Ringkasan pemakaian JENDELA PAKET (seluler sejak tanggal mulai).
   * NULL bila tidak ada paket aktif — pemeriksaan ambang kuota +
   * prediksi kritis dilewati, pengingat internet tetap jalan.
   */
  quotaSummary: UsageSummary | null;
  /** Pemakaian hari ini (untuk ringkasan + pengingat internet); null bila tidak ada. */
  daily: NotificationDailyData | null;
  /** Bucket harian untuk prediksi berbobot (T2.3). */
  buckets: DailyBucket[];
  now?: Date;
};

export type NotificationCheckResult = {
  /** Temuan baru yang dibuatkan entri + upaya pengiriman. */
  fired: NotificationFinding[];
  /** True bila ringkasan harian benar-benar terkirim pada pemeriksaan ini. */
  summarySent: boolean;
};

/**
 * Jalankan satu pemeriksaan notifikasi dari data yang sudah dimuat.
 * Aman dipanggil berulang kali: temuan yang sudah berbunyi dilewati
 * lewat kunci dedup.
 */
export async function runNotificationChecks(
  data: NotificationCheckData,
): Promise<NotificationCheckResult> {
  const hasil: NotificationCheckResult = { fired: [], summarySent: false };
  const { settings } = data;
  if (!settings.notificationsEnabled) return hasil;
  // Hanya data segar asli yang boleh memicu — lihat jaminan di atas.
  // Tanpa paket, kesegaran dinilai dari data harian (bucket); dengan
  // paket, dari ringkasan jendela paket seperti sebelumnya.
  const segar =
    data.quotaSummary !== null
      ? data.quotaSummary.source === 'native' && !data.quotaSummary.fromSnapshot
      : data.daily !== null &&
        data.daily.source === 'native' &&
        !data.daily.fromSnapshot;
  if (!segar) return hasil;
  const now = data.now ?? new Date();
  const pkg: QuotaPackage | null = settings.pkg;
  const notifState = await loadNotificationState(sqliteStore);

  const temuan: NotificationFinding[] = [];

  // Ambang 50/80/100 + pengingat prediksi kritis — hanya bila ada
  // paket aktif dan ringkasan jendela paketnya tersedia.
  if (pkg !== null && data.quotaSummary !== null) {
    const state = computeQuota(pkg, data.quotaSummary.mobileBytes, now, data.buckets);
    temuan.push(
      ...detectThresholdCrossings({
        usedPercent: state.usedPercent,
        enabledThresholds: settings.notificationThresholds,
        firedIds: notifState.firedIds,
        pkg,
        usedBytes: state.usedBytes,
        remainingBytes: state.remainingBytes,
        now,
      }),
    );
    const kritis = detectCriticalForecast({
      forecast: state.forecast,
      packageEnd: state.packageEnd,
      remainingBytes: state.remainingBytes,
      firedIds: notifState.firedIds,
      pkg,
      now,
    });
    if (kritis) temuan.push(kritis);
  }

  // Pengingat internet (v1.3.0) — tidak bergantung pada paket.
  if (data.daily !== null) {
    const totalHariIni = data.daily.todayMobileBytes + data.daily.todayWifiBytes;
    const batasHarian = detectDailyInternetBudget({
      todayTotalBytes: totalHariIni,
      budgetBytes: settings.dailyInternetBudgetBytes,
      firedIds: notifState.firedIds,
      now,
    });
    if (batasHarian) temuan.push(batasHarian);
    temuan.push(
      ...detectPerAppBudgets({
        perAppToday: data.daily.perAppToday,
        budgets: settings.perAppBudgets,
        firedIds: notifState.firedIds,
        now,
      }),
    );

    // Pemakaian malam: jendela 00:00–06:00 yang baru berakhir, dihitung
    // dari query native langsung (bukan bucket harian — bucket tidak
    // punya resolusi jam). Query dilewati bila malam itu sudah
    // dilaporkan, atau bila pengingat malam dimatikan.
    if (settings.overnightAlertEnabled) {
      const jendela = overnightWindowFor(now);
      const kunciMalam = jendela ? `pemakaian-malam:${jendela.nightDateISO}` : null;
      if (jendela !== null && kunciMalam !== null && !notifState.firedIds.includes(kunciMalam)) {
        const malam = await getDeviceUsageForRange(jendela.start, jendela.end);
        if (malam.source === 'native') {
          const semalam = detectOvernightUsage({
            nightTotalBytes: malam.mobileBytes + malam.wifiBytes,
            firedIds: notifState.firedIds,
            now,
          });
          if (semalam) temuan.push(semalam);
        }
      }
    }
  }

  if (temuan.length > 0) {
    // Exactly-once: klaim tiap kunci dedup DULU (atomik, lintas
    // pelari), baru pemenang yang dicatat + dikirim. Tanpa ini, effect
    // foreground dan tugas latar yang berjalan bersamaan sama-sama
    // lolos cek-di-awal lalu sama-sama mengirim (notifikasi ganda).
    const menang: NotificationFinding[] = [];
    for (const t of temuan) {
      if (await claimFiredKey(sqliteStore, t.dedupKey)) menang.push(t);
    }
    if (menang.length > 0) {
      // Entri dulu (catatan durable), lalu ping best-effort — urutan
      // ini menjaga invarian satu-entri-per-kejadian walau pengiriman
      // gagal. Klaim sudah dicatat oleh claimFiredKey.
      await addAlertEntries(
        menang.map((t) => ({
          id: t.dedupKey,
          kind: t.kind,
          dateISO: t.dateISO,
          title: t.title,
          detail: t.detail,
          thresholdPercent: t.thresholdPercent,
        })),
        now,
      );
      for (const t of menang) {
        await sendLocalNotification(t.title, t.detail);
      }
      hasil.fired = menang;
    }
  }

  // Ringkasan harian (sekali sehari, hanya bila benar-benar terkirim).
  // Sisa kuota dihitung hanya bila ada paket; tanpa paket, ringkasan
  // tetap terkirim dengan angka internet hari ini. Klaim atomik
  // menutup balapan yang sama seperti temuan di atas.
  const tanggalRingkasan = dateISOOf(now);
  if (
    data.daily &&
    shouldSendDailySummary({
      dailySummaryEnabled: settings.dailySummaryEnabled,
      dailySummaryHour: settings.dailySummaryHour,
      lastSentDateISO: notifState.lastDailySummaryDateISO,
      now,
    }) &&
    (await claimFiredKey(sqliteStore, `ringkasan-harian:${tanggalRingkasan}`))
  ) {
    const isi = dailySummaryContent({
      todayMobileBytes: data.daily.todayMobileBytes,
      todayWifiBytes: data.daily.todayWifiBytes,
      todayTotalBytes: data.daily.todayMobileBytes + data.daily.todayWifiBytes,
      remainingBytes:
        pkg !== null && data.quotaSummary !== null
          ? Math.max(0, pkg.quotaBytes - data.quotaSummary.mobileBytes)
          : 0,
      pkg,
    });
    const terkirim = await sendLocalNotification(isi.title, isi.body);
    if (terkirim) {
      await markDailySummarySent(sqliteStore, dateISOOf(now));
      hasil.summarySent = true;
    }
  }

  return hasil;
}

/**
 * Pemeriksaan dari tugas latar (T4.2): memuat pengaturan + ringkasan
 * jendela paket + bucket harian sendiri, lalu memakai jalur yang sama
 * dengan pemeriksaan foreground. Dipanggil dari notificationTask.ts.
 */
export async function runBackgroundNotificationCheck(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.notificationsEnabled) return;
  const now = new Date();
  const pkg = settings.pkg;
  const hariIniISO = dateISOOf(now);
  // Tanpa paket: ringkasan jendela paket dilewati (null) — pengingat
  // internet tetap jalan dari bucket harian.
  const jendela = pkg !== null ? packageWindow(pkg.startDate) : null;
  const [quotaSummary, harian] = await Promise.all([
    jendela !== null
      ? getUsageSummaryForRange(jendela.start, jendela.end)
      : Promise.resolve(null),
    refreshDailyBuckets(now),
  ]);
  const bucketHariIni = harian.buckets.find((b) => b.dateISO === hariIniISO);
  await runNotificationChecks({
    settings,
    quotaSummary,
    daily: {
      todayMobileBytes: bucketHariIni?.mobileBytes ?? 0,
      todayWifiBytes: bucketHariIni?.wifiBytes ?? 0,
      perAppToday: harian.perAppDaily
        .filter((b) => b.dateISO === hariIniISO)
        .map((b) => ({ packageName: b.packageName, label: b.label, bytes: b.bytes })),
      source: harian.source,
      fromSnapshot: harian.fromSnapshot,
    },
    buckets: harian.buckets,
    now,
  });
}
