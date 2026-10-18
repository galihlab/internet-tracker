import AsyncStorage from '@react-native-async-storage/async-storage';
import { GB } from './format';
import { startOfDayMillis, todayWindow } from './windows';
import { normalisasiAppUsage, reconcileAppUsage } from './appUsage';
import {
  emptySummary,
  loadSummarySnapshot,
  saveSummarySnapshot,
  snapshotToSummary,
  summaryWindowKey,
} from './summarySnapshots';

// Tipe modul native (dari modules/usage-stats). Import type-only: tidak ada
// side effect di runtime, jadi aman di Expo Go. Default export-nya adalah
// instance modul, jadi tipenya diambil lewat `typeof`.
import type UsageStatsModuleInstance from '../../modules/usage-stats';
// Tipe bucket diimpor langsung dari berkas tipenya (bukan lewat index
// yang me-re-export default) supaya parser lint tidak gagal pada impor
// campuran default + named dalam satu pernyataan type-only.
import type {
  DailyAppBucket,
  DailyBucket,
} from '../../modules/usage-stats/src/UsageStats.types';

export type Period = '24h' | '7d' | '30d';

export type AppUsage = {
  packageName: string;
  label: string;
  /** Total = mobileBytes + wifiBytes. */
  bytes: number;
  /** Pemakaian seluler (T3.3). */
  mobileBytes: number;
  /** Pemakaian Wi-Fi (T3.3). */
  wifiBytes: number;
};

export type UsageSummary = {
  wifiBytes: number;
  mobileBytes: number;
  totalBytes: number;
  periodStart: number;
  periodEnd: number;
  perApp: AppUsage[];
  /**
   * 'native' = angka asli dari NetworkStatsManager,
   * 'sample' = data contoh (hanya bila modul native TIDAK tersedia),
   * 'snapshot' = angka terakhir tersimpan (query native gagal — T3.6),
   * 'empty' = fallback jujur: nol karena query gagal tanpa snapshot.
   */
  source: 'native' | 'sample' | 'snapshot' | 'empty';
  /** True bila angka berasal dari snapshot tersimpan (query gagal). */
  fromSnapshot: boolean;
  /** Cap waktu data: waktu query segar / snapshot / pembuatan contoh. */
  updatedAt: number;
};

type UsageStatsModuleType = typeof UsageStatsModuleInstance;

let nativePromise: Promise<UsageStatsModuleType | null> | null = null;

/**
 * Muat modul native secara lazy. Di Expo Go / web, requireNativeModule
 * melempar karena modul tidak ter-link -> null -> pemakaian data contoh.
 */
function loadNative(): Promise<UsageStatsModuleType | null> {
  if (!nativePromise) {
    nativePromise = import('../../modules/usage-stats')
      .then((m) => {
        const mod = m.default as unknown as UsageStatsModuleType | undefined;
        return mod && typeof mod.getDeviceUsage === 'function' ? mod : null;
      })
      .catch(() => null);
  }
  return nativePromise;
}

/**
 * Jendela periode terpilih (T2.1) — jendela bernama eksplisit untuk tab
 * Statistik dan Aplikasi, BUKAN untuk angka paket. Diselaraskan ke hari
 * kalender supaya labelnya jujur: 'Hari ini' = sejak tengah malam hari
 * ini (bukan 24 jam ke belakang yang bergeser), '7 hari' = 7 hari
 * kalender terakhir termasuk hari ini, '30 hari' = 30 hari kalender
 * terakhir termasuk hari ini.
 */
export function periodToRange(period: Period, now = Date.now()): { start: number; end: number } {
  const today = new Date(now);
  if (period === '24h') {
    const w = todayWindow(today);
    return { start: w.start, end: w.end };
  }
  const days = period === '7d' ? 7 : 30;
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (days - 1));
  return { start: startOfDayMillis(startDate), end: now };
}

export function periodLabel(period: Period): string {
  return period === '24h' ? 'Hari ini' : period === '7d' ? '7 hari terakhir' : '30 hari terakhir';
}

/** data contoh, dipakai hanya saat modul native tidak tersedia. jelas dilabeli di UI. */
function sampleSummary(start: number, end: number, now: number = Date.now()): UsageSummary {
  const days = Math.max(0.05, (end - start) / (24 * 60 * 60 * 1000));
  const mobileBytes = 6.0 * GB * days;
  const wifiBytes = 0;
  // Data contoh semuanya seluler (wifi 0) supaya totalnya konsisten.
  const perApp: AppUsage[] = [
    { packageName: 'com.zhiliaoapp.musically', label: 'TikTok', bytes: 3.9 * GB * days, mobileBytes: 3.9 * GB * days, wifiBytes: 0 },
    { packageName: 'com.google.android.youtube', label: 'YouTube', bytes: 1.1 * GB * days, mobileBytes: 1.1 * GB * days, wifiBytes: 0 },
    { packageName: 'com.android.chrome', label: 'Chrome', bytes: 0.5 * GB * days, mobileBytes: 0.5 * GB * days, wifiBytes: 0 },
    { packageName: 'com.android.vending', label: 'Play Store', bytes: 0.2 * GB * days, mobileBytes: 0.2 * GB * days, wifiBytes: 0 },
    { packageName: 'com.whatsapp', label: 'WhatsApp', bytes: 0.15 * GB * days, mobileBytes: 0.15 * GB * days, wifiBytes: 0 },
    { packageName: 'lainnya', label: 'Lainnya', bytes: 0.15 * GB * days, mobileBytes: 0.15 * GB * days, wifiBytes: 0 },
  ];
  return {
    wifiBytes,
    mobileBytes,
    totalBytes: wifiBytes + mobileBytes,
    periodStart: start,
    periodEnd: end,
    perApp,
    source: 'sample',
    fromSnapshot: false,
    updatedAt: now,
  };
}

/**
 * Ringkasan pemakaian untuk satu rentang (T3.6, jalur ringkasan).
 * - Query native berhasil -> ringkasan segar disimpan sebagai snapshot.
 * - Query native gagal dan ada snapshot jendela itu -> snapshot
 *   dikembalikan (source 'snapshot', fromSnapshot true, cap updatedAt).
 * - Modul native tidak tersedia sama sekali (Expo Go / web) -> data
 *   contoh berlabel, TIDAK disimpan sebagai snapshot.
 * - Query gagal tanpa snapshot -> fallback jujur 'empty' (nol),
 *   BUKAN data contoh diam-diam.
 * Snapshot selalu satu set yang konsisten (total + per aplikasi dari
 * query yang sama); kegagalan parsial per aplikasi tidak menimpa
 * snapshot lama dengan daftar kosong.
 */
export async function getUsageSummaryForRange(
  start: number,
  end: number,
): Promise<UsageSummary> {
  const now = Date.now();
  const kunci = summaryWindowKey(start, end, now);
  const device = await getDeviceUsageForRange(start, end);
  if (device.source === 'snapshot') {
    const tersimpan = await loadSummarySnapshot(AsyncStorage, kunci);
    if (tersimpan) return snapshotToSummary(tersimpan);
    // Snapshot total tanpa per aplikasi (tidak seharusnya terjadi) —
    // kembalikan total snapshot tanpa daftar, bukan data contoh.
    return {
      wifiBytes: device.wifiBytes,
      mobileBytes: device.mobileBytes,
      totalBytes: device.wifiBytes + device.mobileBytes,
      periodStart: start,
      periodEnd: device.updatedAt,
      perApp: [],
      source: 'snapshot',
      fromSnapshot: true,
      updatedAt: device.updatedAt,
    };
  }
  if (device.source === 'sample') {
    return sampleSummary(start, end, now);
  }
  if (device.source === 'empty') {
    return emptySummary(start, end, now);
  }
  // Perangkat native berhasil — coba daftar per aplikasi.
  const mod = await loadNative();
  let perApp: AppUsage[] = [];
  let perAppOk = false;
  if (mod) {
    try {
      // Daftar per aplikasi LENGKAP (200, sama seperti tab Aplikasi) —
      // bukan top-10: limit 10 membuat aplikasi di luar 10 besar hilang
      // dari Beranda (3 teratas), Statistik (aplikasi teratas), DAN dari
      // snapshot — rasanya "tidak mendeteksi semua aplikasi".
      const mentah = await mod.getAppUsage(start, end, 200);
      // Rekonsiliasi (T3.3): jumlah daftar + "Sistem dan lainnya" selalu
      // sama dengan total perangkat untuk jendela yang sama.
      perApp = reconcileAppUsage(device.mobileBytes, device.wifiBytes, mentah);
      perAppOk = true;
    } catch {
      // Gagal baca per aplikasi — ringkasan perangkat tetap dipakai,
      // tapi snapshot lama TIDAK ditimpa dengan daftar kosong.
    }
  }
  const ringkasan: UsageSummary = {
    wifiBytes: device.wifiBytes,
    mobileBytes: device.mobileBytes,
    totalBytes: device.wifiBytes + device.mobileBytes,
    periodStart: start,
    periodEnd: end,
    perApp,
    source: 'native',
    fromSnapshot: false,
    updatedAt: now,
  };
  // Hanya set lengkap (perangkat + per aplikasi) yang disimpan.
  if (perAppOk) {
    await saveSummarySnapshot(AsyncStorage, kunci, ringkasan, now);
  }
  return ringkasan;
}

/**
 * Daftar per aplikasi untuk satu rentang, TERPECAH seluler/Wi-Fi dan
 * terekonsiliasi terhadap total perangkat (T3.2 + T3.3). `limit`
 * mengontrol berapa aplikasi teratas yang diambil dari native — tab
 * Aplikasi memakai 200 supaya tampil SEMUA aplikasi yang memakai data.
 * Mengembalikan daftar kosong bila modul native tidak tersedia.
 * Bila query native gagal dan ada snapshot jendela itu, daftar
 * per aplikasi dari snapshot dikembalikan (satu set konsisten dengan
 * total snapshot) — bukan daftar kosong yang menyembunyikan angka
 * tersimpan, dan bukan data contoh.
 */
export async function getAppUsageForRange(
  start: number,
  end: number,
  limit: number,
): Promise<AppUsage[]> {
  const now = Date.now();
  const kunci = summaryWindowKey(start, end, now);
  const device = await getDeviceUsageForRange(start, end);
  if (device.source === 'snapshot') {
    const tersimpan = await loadSummarySnapshot(AsyncStorage, kunci);
    return tersimpan ? tersimpan.summary.perApp : [];
  }
  if (device.source !== 'native') return [];
  const mod = await loadNative();
  if (!mod) return [];
  try {
    const mentah = await mod.getAppUsage(start, end, limit);
    const hasil = reconcileAppUsage(device.mobileBytes, device.wifiBytes, mentah);
    // Query lengkap berhasil — simpan sebagai snapshot jendela ini.
    await saveSummarySnapshot(
      AsyncStorage,
      kunci,
      {
        wifiBytes: device.wifiBytes,
        mobileBytes: device.mobileBytes,
        totalBytes: device.wifiBytes + device.mobileBytes,
        periodStart: start,
        periodEnd: end,
        perApp: hasil,
        source: 'native',
        fromSnapshot: false,
        updatedAt: now,
      },
      now,
    );
    return hasil;
  } catch {
    // Perangkat segar tapi per aplikasi gagal: kembalikan daftar kosong
    // (perilaku lama) — daftar snapshot parsial tanpa total segarnya
    // akan menyesatkan, dan cap snapshot milik ringkasan tidak berlaku
    // untuk daftar ini.
    return [];
  }
}

/**
 * Pemakaian perangkat (seluler + Wi-Fi) untuk satu rentang, TANPA daftar
 * per aplikasi. Dipakai query harian T1.7 supaya satu rentang tidak
 * memicu query per aplikasi yang tidak dibutuhkan.
 */
/**
 * Pemakaian perangkat (seluler + Wi-Fi) untuk satu rentang, TANPA daftar
 * per aplikasi. Dipakai query harian T1.7 supaya satu rentang tidak
 * memicu query per aplikasi yang tidak dibutuhkan.
 *
 * T3.6: bila query native gagal (throw / izin dicabut / modul error)
 * dan ada snapshot untuk jendela itu, total snapshot dikembalikan
 * (source 'snapshot', fromSnapshot true, cap updatedAt). Bila modul
 * native TIDAK TERSEDIA sama sekali (Expo Go / web), data contoh
 * berlabel dikembalikan — dan hanya dalam kasus itu. Bila query gagal
 * tanpa snapshot, fallback jujur 'empty' (nol), bukan data contoh.
 */
export async function getDeviceUsageForRange(
  start: number,
  end: number,
): Promise<{
  wifiBytes: number;
  mobileBytes: number;
  source: 'native' | 'sample' | 'snapshot' | 'empty';
  fromSnapshot: boolean;
  updatedAt: number;
}> {
  const now = Date.now();
  const mod = await loadNative();
  if (mod) {
    try {
      const device = await mod.getDeviceUsage(start, end);
      return {
        wifiBytes: device.wifiBytes,
        mobileBytes: device.mobileBytes,
        source: 'native',
        fromSnapshot: false,
        updatedAt: now,
      };
    } catch {
      // Gagal baca native (misal izin dicabut) -> coba snapshot.
      const tersimpan = await loadSummarySnapshot(
        AsyncStorage,
        summaryWindowKey(start, end, now),
      );
      if (tersimpan) {
        return {
          wifiBytes: tersimpan.summary.wifiBytes,
          mobileBytes: tersimpan.summary.mobileBytes,
          source: 'snapshot',
          fromSnapshot: true,
          updatedAt: tersimpan.updatedAt,
        };
      }
      // Tanpa snapshot: nol yang jujur, bukan data contoh.
      return { wifiBytes: 0, mobileBytes: 0, source: 'empty', fromSnapshot: false, updatedAt: now };
    }
  }
  const sample = sampleSummary(start, end, now);
  return {
    wifiBytes: sample.wifiBytes,
    mobileBytes: sample.mobileBytes,
    source: 'sample',
    fromSnapshot: false,
    updatedAt: now,
  };
}

export async function getUsageSummary(period: Period): Promise<UsageSummary> {
  const { start, end } = periodToRange(period);
  return getUsageSummaryForRange(start, end);
}

export async function getNativeStatus(): Promise<{ available: boolean; granted: boolean }> {
  const mod = await loadNative();
  if (!mod) return { available: false, granted: false };
  try {
    return { available: true, granted: await mod.hasUsageAccess() };
  } catch {
    return { available: true, granted: false };
  }
}

/**
 * Bucket harian dari modul native. Mengembalikan null bila modul tidak
 * tersedia atau query gagal — pemanggil memakai snapshot tersimpan
 * (lihat dailyBuckets.ts), bukan data contoh diam-diam.
 */
export async function getDailyBuckets(
  start: number,
  end: number,
): Promise<DailyBucket[] | null> {
  const mod = await loadNative();
  if (!mod || typeof mod.getDailyBuckets !== 'function') return null;
  try {
    const buckets = await mod.getDailyBuckets(start, end);
    return Array.isArray(buckets) ? buckets : null;
  } catch {
    return null;
  }
}

/**
 * Bucket per aplikasi per hari dari modul native. Null bila modul tidak
 * tersedia atau query gagal — sama seperti `getDailyBuckets`.
 */
export async function getDailyAppBuckets(
  start: number,
  end: number,
  limit: number,
): Promise<DailyAppBucket[] | null> {
  const mod = await loadNative();
  if (!mod || typeof mod.getDailyAppBuckets !== 'function') return null;
  try {
    const buckets = await mod.getDailyAppBuckets(start, end, limit);
    if (!Array.isArray(buckets)) return null;
    // Normalisasi: entri lama / native lama tanpa bidang pecah dibaca
    // seluruhnya sebagai seluler (lihat normalisasiAppUsage).
    return buckets.map((b) => {
      const pecah = normalisasiAppUsage({
        packageName: b.packageName,
        label: b.label,
        bytes: b.bytes,
        mobileBytes: (b as Partial<DailyAppBucket>).mobileBytes,
        wifiBytes: (b as Partial<DailyAppBucket>).wifiBytes,
      });
      return {
        packageName: pecah.packageName,
        label: pecah.label,
        dateISO: b.dateISO,
        bytes: pecah.bytes,
        mobileBytes: pecah.mobileBytes,
        wifiBytes: pecah.wifiBytes,
      };
    });
  } catch {
    return null;
  }
}

export function openUsageAccessSettings(): void {
  void loadNative().then((mod) => mod?.openUsageAccessSettings());
}
