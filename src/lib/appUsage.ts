// Logika murni daftar per aplikasi (T3.2 + T3.3) — tanpa dependensi
// React Native / modul native, supaya bisa diuji unit dengan node:test.
//
// Dua janji yang dipegang modul ini:
//
// 1. Rekonsiliasi: jumlah daftar per aplikasi SELALU sama dengan total
//    perangkat untuk jendela yang sama. Selisih karena UID bersama dan
//    layanan sistem dikelompokkan sebagai baris "Sistem dan lainnya",
//    bukan dibiarkan hilang. Bila jumlah per aplikasi melebihi total
//    perangkat (mis. data lama pra-T3.3 yang menggandakan UID bersama),
//    tiap aplikasi diskalakan proporsional supaya jumlahnya pas.
// 2. Urut + cari: urut menurut seluler / Wi-Fi / nama, dan cari menurut
//    label atau nama paket.

import type {
  AppUsage,
  DailyAppBucket,
} from '../../modules/usage-stats/src/UsageStats.types';

/** Nama paket semu untuk baris rekonsiliasi — bukan aplikasi nyata. */
export const SYSTEM_ROW_PACKAGE = '__sistem__';

/** Label baris rekonsiliasi. */
export const SYSTEM_ROW_LABEL = 'Sistem dan lainnya';

export type AppSortKey = 'mobile' | 'wifi' | 'name';

/** Bersihkan angka: negatif / tidak berhingga / NaN dibaca 0. */
function bersih(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Normalisasi satu entri per aplikasi ke bentuk pecah (T3.3). */
export function normalisasiAppUsage(app: Partial<AppUsage> & { packageName: string }): AppUsage {
  const mobile = bersih(app.mobileBytes ?? NaN);
  const wifi = bersih(app.wifiBytes ?? NaN);
  // Data lama pra-T3.3 hanya punya `bytes` gabungan: seluruhnya dibaca
  // sebagai seluler supaya total tetap pas — entri ini tertimpa query
  // segar berikutnya yang sudah terpecah.
  const total = bersih(app.bytes ?? NaN);
  if (app.mobileBytes === undefined && app.wifiBytes === undefined) {
    return {
      packageName: app.packageName,
      label: typeof app.label === 'string' ? app.label : app.packageName,
      bytes: total,
      mobileBytes: total,
      wifiBytes: 0,
    };
  }
  return {
    packageName: app.packageName,
    label: typeof app.label === 'string' ? app.label : app.packageName,
    bytes: mobile + wifi,
    mobileBytes: mobile,
    wifiBytes: wifi,
  };
}

/**
 * Rekonsiliasi daftar per aplikasi terhadap total perangkat: jumlah
 * seluler daftar + baris sistem = total seluler perangkat, begitu pula
 * Wi-Fi. Baris "Sistem dan lainnya" hanya ditambahkan bila selisihnya
 * positif. Daftar masuk diasumsikan sudah dinormalisasi; entri dengan
 * angka rusak dinormalisasi dulu di sini.
 */
export function reconcileAppUsage(
  deviceMobileBytes: number,
  deviceWifiBytes: number,
  apps: AppUsage[],
): AppUsage[] {
  const perangkatSeluler = Math.max(0, deviceMobileBytes);
  const perangkatWifi = Math.max(0, deviceWifiBytes);
  const ternormalisasi = apps
    .map(normalisasiAppUsage)
    .filter((a) => a.packageName !== SYSTEM_ROW_PACKAGE);

  let jumlahSeluler = ternormalisasi.reduce((s, a) => s + a.mobileBytes, 0);
  let jumlahWifi = ternormalisasi.reduce((s, a) => s + a.wifiBytes, 0);

  let hasil = ternormalisasi;
  if (jumlahSeluler > perangkatSeluler || jumlahWifi > perangkatWifi) {
    // Jumlah melebihi total perangkat — skalakan tiap jaringan secara
    // proporsional supaya jumlahnya tepat sama dengan total perangkat.
    const faktorSeluler = jumlahSeluler > 0 ? perangkatSeluler / jumlahSeluler : 0;
    const faktorWifi = jumlahWifi > 0 ? perangkatWifi / jumlahWifi : 0;
    hasil = ternormalisasi.map((a) => ({
      ...a,
      mobileBytes: a.mobileBytes * faktorSeluler,
      wifiBytes: a.wifiBytes * faktorWifi,
      bytes: a.mobileBytes * faktorSeluler + a.wifiBytes * faktorWifi,
    }));
    jumlahSeluler = perangkatSeluler;
    jumlahWifi = perangkatWifi;
  }

  const sisaSeluler = perangkatSeluler - jumlahSeluler;
  const sisaWifi = perangkatWifi - jumlahWifi;
  if (sisaSeluler > 0 || sisaWifi > 0) {
    hasil = [
      ...hasil,
      {
        packageName: SYSTEM_ROW_PACKAGE,
        label: SYSTEM_ROW_LABEL,
        bytes: sisaSeluler + sisaWifi,
        mobileBytes: sisaSeluler,
        wifiBytes: sisaWifi,
      },
    ];
  }
  return hasil;
}

/** Jumlah seluler + Wi-Fi seluruh daftar. */
export function sumAppUsage(apps: AppUsage[]): { mobileBytes: number; wifiBytes: number; totalBytes: number } {
  const mobileBytes = apps.reduce((s, a) => s + bersih(a.mobileBytes), 0);
  const wifiBytes = apps.reduce((s, a) => s + bersih(a.wifiBytes), 0);
  return { mobileBytes, wifiBytes, totalBytes: mobileBytes + wifiBytes };
}

/** Urutkan daftar: seluler / Wi-Fi menurun, nama menaik (A–Z, id-ID). */
export function sortApps(apps: AppUsage[], kunci: AppSortKey): AppUsage[] {
  const salinan = [...apps];
  if (kunci === 'name') {
    return salinan.sort((a, b) => a.label.localeCompare(b.label, 'id-ID'));
  }
  const bidang = kunci === 'mobile' ? 'mobileBytes' : 'wifiBytes';
  return salinan.sort((a, b) => b[bidang] - a[bidang] || a.label.localeCompare(b.label, 'id-ID'));
}

/** Saring daftar menurut label atau nama paket (tidak peka huruf). */
export function filterApps(apps: AppUsage[], query: string): AppUsage[] {
  const q = query.trim().toLowerCase();
  if (q === '') return apps;
  return apps.filter(
    (a) => a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q),
  );
}

/** Satu titik harian satu aplikasi: seluler + Wi-Fi pada tanggal itu. */
export type AppDailyPoint = {
  dateISO: string;
  mobileBytes: number;
  wifiBytes: number;
};

/**
 * Agregasi bucket per aplikasi per hari menjadi deret harian satu
 * aplikasi (T3.4): jumlahkan semua bucket dengan nama paket itu,
 * urut naik menurut tanggal.
 */
export function aggregateDailyAppBuckets(
  buckets: DailyAppBucket[],
  packageName: string,
): AppDailyPoint[] {
  const perTanggal = new Map<string, AppDailyPoint>();
  for (const b of buckets) {
    if (b.packageName !== packageName) continue;
    const lama = perTanggal.get(b.dateISO) ?? { dateISO: b.dateISO, mobileBytes: 0, wifiBytes: 0 };
    const mobile = Number.isFinite(b.mobileBytes) ? Math.max(0, b.mobileBytes) : Math.max(0, b.bytes);
    const wifi = Number.isFinite(b.wifiBytes) ? Math.max(0, b.wifiBytes) : 0;
    perTanggal.set(b.dateISO, {
      dateISO: b.dateISO,
      mobileBytes: lama.mobileBytes + mobile,
      wifiBytes: lama.wifiBytes + wifi,
    });
  }
  return [...perTanggal.values()].sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
}

/** Perbandingan pemakaian dengan periode sebelumnya (T3.4). */
export function compareWithPrevious(
  sekarang: number,
  sebelumnya: number,
): { deltaBytes: number; deltaPercent: number | null; naik: boolean | null } {
  const deltaBytes = sekarang - sebelumnya;
  if (sebelumnya <= 0) {
    return { deltaBytes, deltaPercent: null, naik: sekarang > 0 ? true : null };
  }
  return {
    deltaBytes,
    deltaPercent: (deltaBytes / sebelumnya) * 100,
    naik: deltaBytes > 0 ? true : deltaBytes < 0 ? false : null,
  };
}

/**
 * Aplikasi teratas pada satu tanggal dari bucket per aplikasi per hari
 * (v1.2.0 — rincian hari di Statistik): entri dengan `bytes` terbesar
 * pada tanggal itu. Null bila tidak ada bucket untuk tanggal itu
 * (bucket per aplikasi hanya dikumpulkan 30 hari terakhir).
 */
export function topAppForDay(
  buckets: DailyAppBucket[],
  dateISO: string,
): DailyAppBucket | null {
  let teratas: DailyAppBucket | null = null;
  for (const b of buckets) {
    if (b.dateISO !== dateISO) continue;
    if (!teratas || b.bytes > teratas.bytes) teratas = b;
  }
  return teratas;
}
