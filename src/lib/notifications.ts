// Deteksi notifikasi kuota (T4.2) — logika MURNI, tanpa dependensi
// React Native / Expo / AsyncStorage, supaya bisa diuji unit dengan
// node:test. Yang diputuskan di sini HANYA "temuan apa yang baru":
// pengiriman, penyimpanan, dan dedup ada di notificationChecks.ts /
// notificationState.ts.
//
// Aturan yang dikunci (dari rencana Fase 4, T4.2):
//
// - Ambang 50%, 80%, 100% kuota terpakai. Setiap ambang hanya berbunyi
//   SEKALI PER PAKET: kunci dedup memuat signature paket
//   (startDate + kuota + durasi). Paket baru (signature baru) boleh
//   berbunyi lagi; mengedit nama/operator/jaringan TIDAK mengubah
//   signature sehingga tidak memicu bunyi ulang.
// - Pengingat prediksi kritis: SEKALI per paket, bila prediksi berbobot
//   (T2.3) menyatakan kuota habis SEBELUM masa aktif berakhir. Bila
//   kuota sudah habis, ambang 100% sudah mencakupnya — tidak ada entri
//   prediksi kritis kedua. Bila masa aktif sudah berakhir, tidak ada
//   gunanya mengingatkan.
// - Ringkasan harian: SEKALI sehari, bila jam sekarang sudah melewati
//   jam pilihan pengguna dan belum terkirim hari ini. Isinya angka
//   hari ini + sisa kuota — selalu berangka, tidak pernah generik.
// - Setiap temuan WAJIB membawa angka penyebabnya (sama seperti T2.6):
//   tidak ada peringatan tanpa angka.

import { formatBytes, formatDateID, formatGB } from './format';
import type { Forecast } from './forecast';
import type { QuotaPackage } from './quota';
import { dateISOOf } from './windows';

/** Ambang peringatan yang tersedia — sama dengan opsi Pengaturan. */
export const NOTIFICATION_THRESHOLDS = [50, 80, 100] as const;

/** Jenis temuan notifikasi (dipetakan ke jenis entri peringatan T4.3). */
export type NotificationFindingKind = 'ambang-kuota' | 'prediksi-kritis';

export type NotificationFinding = {
  kind: NotificationFindingKind;
  /** Kunci dedup: satu kejadian = satu bunyi + satu entri peringatan. */
  dedupKey: string;
  /** Tanggal lokal 'YYYY-MM-DD' kejadian. */
  dateISO: string;
  title: string;
  /** Kalimat berangka penyebabnya. */
  detail: string;
  /** Ambang yang tercapai (hanya untuk 'ambang-kuota'). */
  thresholdPercent?: number;
};

/**
 * Signature paket untuk dedup "sekali per paket": tanggal mulai +
 * total kuota + durasi. Nama/operator/jaringan sengaja TIDAK ikut —
 * mengedit label paket tidak boleh memicu bunyi ulang ambang yang
 * sudah berbunyi. Mengedit kuota/durasi/tanggal mulai = paket yang
 * berbeda dari sudut pandang dedup (masuk akal: angkanya berubah).
 */
export function packageSignature(pkg: QuotaPackage): string {
  return `${pkg.startDate}|${pkg.quotaBytes}|${pkg.durationDays}`;
}

export type ThresholdInput = {
  /** Persen kuota terpakai saat ini (0–100). */
  usedPercent: number;
  /** Ambang yang AKTIF di Pengaturan (subset dari 50/80/100). */
  enabledThresholds: number[];
  /** Kunci dedup yang sudah berbunyi (dari notificationState). */
  firedIds: string[];
  pkg: QuotaPackage;
  /** Terpakai / sisa / total — untuk kalimat berangka. */
  usedBytes: number;
  remainingBytes: number;
  now: Date;
};

/**
 * Ambang-ambang yang BARU tercapai: terpakai >= ambang DAN belum
 * berbunyi untuk paket ini. Diurutkan menaik (50 sebelum 80 sebelum
 * 100). Bila pemakaian melompat melewati dua ambang sekaligus (mis.
 * dari 40% ke 85% dalam satu pemeriksaan), KEDUA ambang dilaporkan —
 * masing-masing tetap tepat sekali per paket, dan pemanggil mengirim
 * satu notifikasi + satu entri PER ambang.
 */
export function detectThresholdCrossings(input: ThresholdInput): NotificationFinding[] {
  const { usedPercent, enabledThresholds, firedIds, pkg, usedBytes, remainingBytes, now } = input;
  const signature = packageSignature(pkg);
  const fired = new Set(firedIds);
  const dateISO = dateISOOf(now);
  const temuan: NotificationFinding[] = [];
  for (const ambang of [...enabledThresholds].sort((a, b) => a - b)) {
    if (!NOTIFICATION_THRESHOLDS.includes(ambang as (typeof NOTIFICATION_THRESHOLDS)[number])) {
      continue;
    }
    if (usedPercent < ambang) continue;
    const kunci = `${signature}:ambang:${ambang}`;
    if (fired.has(kunci)) continue;
    temuan.push({
      kind: 'ambang-kuota',
      dedupKey: kunci,
      dateISO,
      title: `Kuota terpakai ${ambang}%`,
      detail: `Paket ${pkg.name} sudah terpakai ${formatBytes(usedBytes)} (${Math.round(usedPercent)}% dari ${formatGB(pkg.quotaBytes)}), sisa ${formatBytes(remainingBytes)}.`,
      thresholdPercent: ambang,
    });
  }
  return temuan;
}

export type CriticalForecastInput = {
  forecast: Forecast;
  /** Tanggal berakhir masa aktif (eksklusif) dari computeQuota. */
  packageEnd: Date;
  /** Sisa kuota — 0 berarti ambang 100% sudah mencakupnya. */
  remainingBytes: number;
  firedIds: string[];
  pkg: QuotaPackage;
  now: Date;
};

/**
 * Pengingat prediksi kritis: prediksi berbobot menyatakan kuota habis
 * sebelum masa aktif berakhir. Sekali per paket. Mengembalikan null
 * bila tidak kritis / sudah berbunyi / kuota sudah habis / masa aktif
 * sudah berakhir / data belum cukup.
 */
export function detectCriticalForecast(input: CriticalForecastInput): NotificationFinding | null {
  const { forecast, packageEnd, remainingBytes, firedIds, pkg, now } = input;
  if (!forecast.hasEnoughData) return null;
  if (remainingBytes <= 0) return null;
  if (now.getTime() >= packageEnd.getTime()) return null;
  const proyeksi = forecast.projectedRunOut;
  if (proyeksi === null || proyeksi.getTime() >= packageEnd.getTime()) return null;
  const kunci = `${packageSignature(pkg)}:prediksi-kritis`;
  if (firedIds.includes(kunci)) return null;
  return {
    kind: 'prediksi-kritis',
    dedupKey: kunci,
    dateISO: dateISOOf(now),
    title: 'Kuota diprediksi habis sebelum masa aktif berakhir',
    detail: `Dengan rata-rata berbobot ${formatGB(forecast.weightedAvgBytes)}/hari dari ${forecast.fullDaysCount} hari penuh, kuota diprediksi habis sekitar ${formatDateID(proyeksi)} — sebelum masa aktif berakhir ${formatDateID(packageEnd)}. Sisa ${formatBytes(remainingBytes)}.`,
  };
}

export type DailySummaryInput = {
  dailySummaryEnabled: boolean;
  /** Jam pilihan pengguna (0–23). */
  dailySummaryHour: number;
  /** Tanggal lokal terakhir ringkasan terkirim (null bila belum pernah). */
  lastSentDateISO: string | null;
  now: Date;
};

/**
 * Apakah ringkasan harian perlu dikirim SEKARANG: fitur aktif, jam
 * sekarang sudah melewati jam pilihan, dan belum terkirim hari ini.
 * Pemeriksaan ini jalan setiap aplikasi dibuka + lewat tugas latar —
 * bila aplikasi tidak dibuka dan tugas latar tertunda penghemat
 * baterai, ringkasan hari itu bisa terlambat / tidak terkirim, dan
 * itu dinyatakan apa adanya di Pengaturan.
 */
export function shouldSendDailySummary(input: DailySummaryInput): boolean {
  const { dailySummaryEnabled, dailySummaryHour, lastSentDateISO, now } = input;
  if (!dailySummaryEnabled) return false;
  if (now.getHours() < dailySummaryHour) return false;
  return lastSentDateISO !== dateISOOf(now);
}

export type DailySummaryContentInput = {
  todayMobileBytes: number;
  remainingBytes: number;
  pkg: QuotaPackage;
};

/** Isi ringkasan harian — selalu berangka (hari ini + sisa kuota). */
export function dailySummaryContent(input: DailySummaryContentInput): {
  title: string;
  body: string;
} {
  const { todayMobileBytes, remainingBytes, pkg } = input;
  return {
    title: 'Ringkasan harian kuota',
    body: `Hari ini memakai ${formatBytes(todayMobileBytes)} seluler. Sisa kuota ${pkg.name}: ${formatBytes(remainingBytes)} dari ${formatGB(pkg.quotaBytes)}.`,
  };
}
