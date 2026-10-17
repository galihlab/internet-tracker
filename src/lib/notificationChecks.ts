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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addAlertEntries } from './alerts';
import { computeQuota, type QuotaPackage } from './quota';
import type { DailyBucket } from '../../modules/usage-stats';
import {
  dailySummaryContent,
  detectCriticalForecast,
  detectThresholdCrossings,
  shouldSendDailySummary,
  type NotificationFinding,
} from './notifications';
import {
  loadNotificationState,
  markDailySummarySent,
  markNotificationsFired,
} from './notificationState';
import { sendLocalNotification } from './notify';
import type { StoredSettings } from './storage';
import { loadSettings } from './storage';
import { getUsageSummaryForRange, type UsageSummary } from './usageStats';
import { refreshDailyBuckets } from './dailyBuckets';
import { dateISOOf, packageWindow } from './windows';

export type NotificationCheckData = {
  settings: StoredSettings;
  /** Ringkasan pemakaian JENDELA PAKET (seluler sejak tanggal mulai). */
  quotaSummary: UsageSummary;
  /** Seluler hari ini (untuk isi ringkasan harian); null bila tidak ada. */
  daily: { todayMobileBytes: number } | null;
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
  if (data.quotaSummary.source !== 'native' || data.quotaSummary.fromSnapshot) {
    return hasil;
  }
  const now = data.now ?? new Date();
  const pkg: QuotaPackage = settings.pkg;
  const state = computeQuota(pkg, data.quotaSummary.mobileBytes, now, data.buckets);
  const notifState = await loadNotificationState(AsyncStorage);

  // Ambang 50/80/100 + pengingat prediksi kritis.
  const temuan: NotificationFinding[] = [
    ...detectThresholdCrossings({
      usedPercent: state.usedPercent,
      enabledThresholds: settings.notificationThresholds,
      firedIds: notifState.firedIds,
      pkg,
      usedBytes: state.usedBytes,
      remainingBytes: state.remainingBytes,
      now,
    }),
  ];
  const kritis = detectCriticalForecast({
    forecast: state.forecast,
    packageEnd: state.packageEnd,
    remainingBytes: state.remainingBytes,
    firedIds: notifState.firedIds,
    pkg,
    now,
  });
  if (kritis) temuan.push(kritis);

  if (temuan.length > 0) {
    // Entri dulu (catatan durable), lalu ping best-effort, lalu tandai
    // berbunyi — urutan ini menjaga invarian satu-entri-per-kejadian
    // walau pengiriman gagal.
    await addAlertEntries(
      temuan.map((t) => ({
        id: t.dedupKey,
        kind: t.kind,
        dateISO: t.dateISO,
        title: t.title,
        detail: t.detail,
        thresholdPercent: t.thresholdPercent,
      })),
      now,
    );
    for (const t of temuan) {
      await sendLocalNotification(t.title, t.detail);
    }
    await markNotificationsFired(
      AsyncStorage,
      temuan.map((t) => t.dedupKey),
    );
    hasil.fired = temuan;
  }

  // Ringkasan harian (sekali sehari, hanya bila benar-benar terkirim).
  if (
    data.daily &&
    shouldSendDailySummary({
      dailySummaryEnabled: settings.dailySummaryEnabled,
      dailySummaryHour: settings.dailySummaryHour,
      lastSentDateISO: notifState.lastDailySummaryDateISO,
      now,
    })
  ) {
    const isi = dailySummaryContent({
      todayMobileBytes: data.daily.todayMobileBytes,
      remainingBytes: state.remainingBytes,
      pkg,
    });
    const terkirim = await sendLocalNotification(isi.title, isi.body);
    if (terkirim) {
      await markDailySummarySent(AsyncStorage, dateISOOf(now));
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
  const jendela = packageWindow(settings.pkg.startDate);
  const [quotaSummary, harian] = await Promise.all([
    getUsageSummaryForRange(jendela.start, jendela.end),
    refreshDailyBuckets(now),
  ]);
  const hariIniISO = dateISOOf(now);
  const bucketHariIni = harian.buckets.find((b) => b.dateISO === hariIniISO);
  await runNotificationChecks({
    settings,
    quotaSummary,
    daily: { todayMobileBytes: bucketHariIni?.mobileBytes ?? 0 },
    buckets: harian.buckets,
    now,
  });
}
