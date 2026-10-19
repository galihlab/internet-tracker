// Snapshot bucket harian (T2.2): hasil query bucket native disimpan lokal
// supaya grafik dan kartu tetap tampil saat izin dicabut atau query
// gagal — menampilkan snapshot TERAKHIR dengan cap "terakhir diperbarui",
// bukan data contoh diam-diam. Data contoh hanya dipakai bila modul
// native TIDAK tersedia sama sekali (Expo Go) dan tidak pernah disimpan.

import { sqliteStore } from './db';
import type { DailyAppBucket, DailyBucket } from '../../modules/usage-stats';
import { mergeDailyAppBuckets, mergeDailyBuckets, sampleDailyBuckets } from './buckets';
import {
  getDailyAppBuckets,
  getDailyBuckets,
  getDeviceUsageForRange,
  getNativeStatus,
} from './usageStats';
import { dateISOOf, dayWindow, MS_PER_DAY, todayWindow } from './windows';

/** Snapshot bucket harian yang tersimpan di SQLite (local DB). */
export type DailyBucketSnapshot = {
  /** Kapan snapshot terakhir berhasil disegarkan (epoch millis). */
  updatedAt: number;
  /** Kapan pengumpulan data harian PERTAMA KALI tercatat (T3.6). */
  firstCollectedAt: number;
  buckets: DailyBucket[];
  perAppDaily: DailyAppBucket[];
  /** Seluler kemarin pada jam yang sama — untuk delta yang adil (T1.7). */
  yesterdaySameHourMobileBytes: number;
};

export type DailyBucketsData = {
  buckets: DailyBucket[];
  perAppDaily: DailyAppBucket[];
  /** Seluler kemarin pada jam yang sama. */
  yesterdaySameHourMobileBytes: number;
  /** 'native' = angka asli, 'sample' = data contoh (hanya Expo Go). */
  source: 'native' | 'sample';
  /** True bila data berasal dari snapshot tersimpan (query gagal / izin dicabut). */
  fromSnapshot: boolean;
  /** Cap waktu data ini: waktu segar terakhir, atau waktu pembuatan contoh. */
  updatedAt: number;
  /** Kapan pengumpulan data harian pertama kali tercatat (T3.6). */
  firstCollectedAt: number;
};

const SNAPSHOT_KEY = '@kuota-tracker:daily-buckets:v1';
/** Rentang bucket perangkat yang di-query tiap segar: 30 hari terakhir. */
const DEVICE_BUCKET_DAYS = 30;
/** Rentang bucket per aplikasi yang di-query tiap segar: 30 hari terakhir. */
const APP_BUCKET_DAYS = 30;
/** Batas aplikasi pada bucket per aplikasi. */
const APP_BUCKET_LIMIT = 10;

/** Muat snapshot tersimpan (atau null bila belum ada / rusak). */
export async function loadDailySnapshot(): Promise<DailyBucketSnapshot | null> {
  try {
    const raw = await sqliteStore.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DailyBucketSnapshot>;
    if (
      typeof parsed.updatedAt !== 'number' ||
      !Array.isArray(parsed.buckets) ||
      !Array.isArray(parsed.perAppDaily) ||
      typeof parsed.yesterdaySameHourMobileBytes !== 'number'
    ) {
      return null;
    }
    return {
      updatedAt: parsed.updatedAt,
      // Snapshot lama pra-T3.6 belum punya firstCollectedAt: pakai
      // updatedAt-nya sebagai perkiraan awal yang jujur (bukan hari ini).
      firstCollectedAt:
        typeof parsed.firstCollectedAt === 'number' ? parsed.firstCollectedAt : parsed.updatedAt,
      // Validasi + gabung lewat merge (menyaring entri rusak).
      buckets: mergeDailyBuckets([], parsed.buckets),
      perAppDaily: mergeDailyAppBuckets([], parsed.perAppDaily),
      yesterdaySameHourMobileBytes: Math.max(0, parsed.yesterdaySameHourMobileBytes),
    };
  } catch {
    return null;
  }
}

async function saveDailySnapshot(snapshot: DailyBucketSnapshot): Promise<void> {
  try {
    await sqliteStore.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Gagal simpan — data segar tetap dipakai di layar ini; snapshot
    // lama (bila ada) dipakai pada pembukaan berikutnya.
  }
}

function snapshotToData(snapshot: DailyBucketSnapshot): DailyBucketsData {
  return {
    buckets: snapshot.buckets,
    perAppDaily: snapshot.perAppDaily,
    yesterdaySameHourMobileBytes: snapshot.yesterdaySameHourMobileBytes,
    source: 'native',
    fromSnapshot: true,
    updatedAt: snapshot.updatedAt,
    firstCollectedAt: snapshot.firstCollectedAt,
  };
}

/**
 * Segarkan bucket harian: query native bila izin tersedia, gabungkan ke
 * snapshot, dan simpan. Bila query gagal atau izin dicabut, kembalikan
 * snapshot terakhir (fromSnapshot: true). Bila tidak ada snapshot dan
 * modul native tidak tersedia (Expo Go), kembalikan data contoh berlabel
 * tanpa menyimpannya. Bila tidak ada snapshot dan query gagal, kembalikan
 * bucket kosong — jujur, tanpa mengarang angka.
 */
export async function refreshDailyBuckets(now: Date = new Date()): Promise<DailyBucketsData> {
  const tersimpan = await loadDailySnapshot();
  const status = await getNativeStatus();

  if (status.available && status.granted) {
    const hariIni = todayWindow(now);
    const awalPerangkat = hariIni.start - (DEVICE_BUCKET_DAYS - 1) * MS_PER_DAY;
    const awalAplikasi = hariIni.start - (APP_BUCKET_DAYS - 1) * MS_PER_DAY;
    // Kemarin pada jam yang sama: satu query rentang — bukan loop
    // per-rentang-hari. Disimpan bersama snapshot supaya kartu yang
    // membaca snapshot tetap punya pembanding delta yang adil.
    const kemarin = dayWindow(
      dateISOOf(new Date(hariIni.start - MS_PER_DAY)),
    );
    const kemarinJamSama = {
      start: kemarin.start,
      end: kemarin.start + (now.getTime() - hariIni.start),
    };

    const [bucketSegar, perAppSegar, kemarinHasil] = await Promise.all([
      getDailyBuckets(awalPerangkat, now.getTime()),
      getDailyAppBuckets(awalAplikasi, now.getTime(), APP_BUCKET_LIMIT),
      getDeviceUsageForRange(kemarinJamSama.start, kemarinJamSama.end),
    ]);

    if (bucketSegar !== null) {
      const snapshot: DailyBucketSnapshot = {
        updatedAt: now.getTime(),
        firstCollectedAt: tersimpan?.firstCollectedAt ?? now.getTime(),
        buckets: mergeDailyBuckets(tersimpan?.buckets ?? [], bucketSegar),
        perAppDaily: mergeDailyAppBuckets(
          tersimpan?.perAppDaily ?? [],
          perAppSegar ?? [],
        ),
        // Bila query kemarin gagal, `getDeviceUsageForRange` jatuh ke
        // data contoh — jangan simpan angka contoh itu sebagai
        // yesterdaySameHour: pertahankan nilai snapshot lama (atau 0).
        yesterdaySameHourMobileBytes:
          kemarinHasil.source === 'native'
            ? kemarinHasil.mobileBytes
            : (tersimpan?.yesterdaySameHourMobileBytes ?? 0),
      };
      await saveDailySnapshot(snapshot);
      return { ...snapshotToData(snapshot), fromSnapshot: false };
    }
    // Query gagal — jatuh ke snapshot di bawah.
  }

  if (tersimpan) return snapshotToData(tersimpan);

  if (!status.available) {
    // Expo Go / web: modul native tidak ada — data contoh berlabel,
    // tidak disimpan sebagai snapshot.
    const hariIni = todayWindow(now);
    const fraksi = (now.getTime() - hariIni.start) / MS_PER_DAY;
    return {
      buckets: sampleDailyBuckets(now),
      perAppDaily: [],
      yesterdaySameHourMobileBytes: 6 * 1024 ** 3 * Math.max(0, fraksi),
      source: 'sample',
      fromSnapshot: false,
      updatedAt: now.getTime(),
      firstCollectedAt: now.getTime(),
    };
  }

  // Izin belum diberi / query gagal dan belum ada snapshot: bucket
  // kosong, bukan angka karangan.
  return {
    buckets: [],
    perAppDaily: [],
    yesterdaySameHourMobileBytes: 0,
    source: 'native',
    fromSnapshot: false,
    updatedAt: now.getTime(),
    // Sampai di sini berarti tidak ada snapshot tersimpan: pengumpulan
    // dimulai sekarang.
    firstCollectedAt: now.getTime(),
  };
}
