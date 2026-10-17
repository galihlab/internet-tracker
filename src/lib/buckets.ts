// Logika murni bucket harian (T2.2) — tanpa dependensi React Native /
// AsyncStorage / modul native, supaya bisa diuji unit dengan node:test.
// Semua fungsi di sini hanya mengolah angka dan tanggal.

import type { DailyAppBucket, DailyBucket } from '../../modules/usage-stats';

/** Jumlah hari yang dipertahankan di snapshot (batas ukuran penyimpanan). */
export const MAX_SNAPSHOT_DAYS = 90;

/** Entri bucket valid: tanggal ISO benar + angka tidak negatif dan berhingga. */
function isValidBucket(b: DailyBucket): boolean {
  return (
    typeof b?.dateISO === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.dateISO) &&
    !Number.isNaN(new Date(b.dateISO).getTime()) &&
    Number.isFinite(b.mobileBytes) &&
    Number.isFinite(b.wifiBytes) &&
    b.mobileBytes >= 0 &&
    b.wifiBytes >= 0
  );
}

/** Entri bucket per aplikasi valid. Sejak T3.3 wajib terpecah; entri lama
 *  pra-T3.3 (hanya `bytes`) diterima dan dinormalisasi di
 *  `mergeDailyAppBuckets` (seluruhnya dibaca sebagai seluler). */
function isValidAppBucket(b: DailyAppBucket): boolean {
  // Entri lama dari snapshot pra-T3.3 mungkin tidak punya bidang pecah
  // di runtime — dibaca lewat `unknown` supaya typecheck tidak menolak
  // pemeriksaan keberadaannya.
  const mentah = b as unknown as { mobileBytes?: unknown; wifiBytes?: unknown };
  const splitValid =
    (typeof mentah.mobileBytes === 'number' &&
      typeof mentah.wifiBytes === 'number' &&
      mentah.mobileBytes >= 0 &&
      mentah.wifiBytes >= 0) ||
    (mentah.mobileBytes === undefined && mentah.wifiBytes === undefined);
  return (
    typeof b?.packageName === 'string' &&
    b.packageName.length > 0 &&
    typeof b?.label === 'string' &&
    typeof b?.dateISO === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.dateISO) &&
    Number.isFinite(b.bytes) &&
    b.bytes >= 0 &&
    splitValid
  );
}

/** Normalisasi entri lama pra-T3.3 ke bentuk terpecah. */
function normalisasiAppBucket(b: DailyAppBucket): DailyAppBucket {
  const mentah = b as unknown as { mobileBytes?: number; wifiBytes?: number };
  if (mentah.mobileBytes === undefined || mentah.wifiBytes === undefined) {
    return { ...b, mobileBytes: b.bytes, wifiBytes: 0 };
  }
  return b;
}

/**
 * Gabungkan bucket segar ke snapshot lama: entri segar menimpa entri lama
 * pada tanggal yang sama, entri lama di luar rentang segar dipertahankan,
 * hasil diurutkan naik menurut tanggal dan dibatasi `MAX_SNAPSHOT_DAYS`
 * hari terakhir. Bucket per aplikasi digabung dengan aturan yang sama
 * (kunci: nama paket + tanggal).
 */
export function mergeDailyBuckets(
  lama: DailyBucket[],
  segar: DailyBucket[],
): DailyBucket[] {
  const gabungan = new Map<string, DailyBucket>();
  for (const b of lama) {
    if (isValidBucket(b)) gabungan.set(b.dateISO, b);
  }
  for (const b of segar) {
    if (isValidBucket(b)) gabungan.set(b.dateISO, b);
  }
  return [...gabungan.values()]
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))
    .slice(-MAX_SNAPSHOT_DAYS);
}

/** Gabungkan bucket per aplikasi per hari — aturan sama seperti `mergeDailyBuckets`. */
export function mergeDailyAppBuckets(
  lama: DailyAppBucket[],
  segar: DailyAppBucket[],
): DailyAppBucket[] {
  const gabungan = new Map<string, DailyAppBucket>();
  const kunci = (b: DailyAppBucket) => `${b.packageName}|${b.dateISO}`;
  for (const b of lama) {
    if (isValidAppBucket(b)) gabungan.set(kunci(b), normalisasiAppBucket(b));
  }
  for (const b of segar) {
    if (isValidAppBucket(b)) gabungan.set(kunci(b), normalisasiAppBucket(b));
  }
  return [...gabungan.values()].sort((a, b) =>
    a.dateISO === b.dateISO
      ? a.packageName.localeCompare(b.packageName)
      : a.dateISO < b.dateISO
        ? -1
        : 1,
  );
}

/**
 * Data contoh bucket harian — HANYA untuk Expo Go / web (modul native
 * tidak tersedia), dan TIDAK PERNAH disimpan sebagai snapshot. Konsisten
 * dengan `sampleSummary` di usageStats.ts: 6 GB seluler per hari penuh,
 * hari ini parsial sebanding waktu yang sudah berjalan.
 */
export function sampleDailyBuckets(now: Date = new Date()): DailyBucket[] {
  const GB = 1024 ** 3;
  const hasil: DailyBucket[] = [];
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const fraksiHariIni = (now.getTime() - startToday) / (24 * 60 * 60 * 1000);
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(startToday - i * 24 * 60 * 60 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    hasil.push({
      dateISO: `${y}-${m}-${day}`,
      mobileBytes: i === 0 ? 6 * GB * Math.max(0, fraksiHariIni) : 6 * GB,
      wifiBytes: 0,
    });
  }
  return hasil;
}
