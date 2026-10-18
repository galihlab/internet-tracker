// Local DB (SQLite via expo-sqlite) — satu-satunya backend penyimpanan
// aplikasi. Menggantikan AsyncStorage: semua data (pengaturan,
// snapshot, peringatan, cache ikon, status notifikasi, bucket harian)
// hidup di satu file SQLite `kuota-tracker.db` (WAL), lewat tabel `kv`
// + `meta`. Bentuk nilai yang disimpan TIDAK berubah (blob JSON yang
// sama seperti di AsyncStorage) — yang pindah hanya mesinnya — jadi
// tidak ada perilaku yang berubah dan tidak ada data yang hilang.
//
// Migrasi sekali jalan: saat pertama dibuka, semua kunci AsyncStorage
// lama disalin ke SQLite, diverifikasi baca-balik, lalu kunci lamanya
// dihapus. Bila migrasi gagal di tengah jalan, penanda `async_migrated`
// tidak ditulis — pembukaan berikutnya mengulang migrasi dari kunci
// yang belum terhapus (idempotent, INSERT OR REPLACE). Selama migrasi
// belum selesai, baca/tulis jatuh ke AsyncStorage supaya data lama
// tidak hilang bila SQLite bermasalah di perangkat itu.

import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DB_NAME = 'kuota-tracker.db';
const SCHEMA_VERSION = 1;
const MIGRATED_KEY = 'async_migrated';

/** Kunci AsyncStorage lama yang dimigrasikan sekali jalan ke SQLite. */
const LEGACY_KEYS = [
  '@kuota-tracker:settings:v1',
  '@kuota-tracker:summary-snapshots:v1',
  '@kuota-tracker:notification-state:v1',
  '@kuota-tracker:daily-buckets:v1',
  '@kuota-tracker:alerts:v1',
  '@kuota-tracker:app-icons:v1',
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Buka database (singleton): buat skema bila belum ada, lalu jalankan
 * migrasi sekali jalan dari AsyncStorage. Bila open/migrasi gagal,
 * promise di-reset supaya panggilan berikutnya mencoba lagi — dan
 * sqliteStore jatuh ke AsyncStorage sementara itu.
 */
function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      try {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        `);
        const ver = await db.getFirstAsync<{ user_version: number }>(
          'PRAGMA user_version',
        );
        if ((ver?.user_version ?? 0) < SCHEMA_VERSION) {
          await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
        }
        await migrateFromAsyncStorage(db);
      } catch (e) {
        try {
          await db.closeAsync();
        } catch {
          // Tutup gagal — abaikan, koneksi dibuang.
        }
        throw e;
      }
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/**
 * Salin kunci AsyncStorage lama ke tabel kv, satu per satu: tulis,
 * verifikasi baca-balik, baru hapus kunci lamanya. Idempotent — kunci
 * yang sudah tersalin dan terhapus dilewati, kunci yang gagal
 * diverifikasi mengulang dari awal pada pembukaan berikutnya.
 */
async function migrateFromAsyncStorage(db: SQLite.SQLiteDatabase): Promise<void> {
  const done = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    [MIGRATED_KEY],
  );
  if (done) return;
  for (const key of LEGACY_KEYS) {
    const lama = await AsyncStorage.getItem(key);
    if (lama === null) continue;
    await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, lama]);
    const balik = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM kv WHERE key = ?',
      [key],
    );
    if (balik?.value !== lama) {
      throw new Error(`migrasi local DB gagal verifikasi untuk ${key}`);
    }
    await AsyncStorage.removeItem(key);
  }
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
    MIGRATED_KEY,
    '1',
  ]);
}

async function kvGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM kv WHERE key = ?',
      [key],
    );
    if (row) return row.value;
    // Belum termigrasi (atau migrasi gagal) — baca dari AsyncStorage lama.
    return await AsyncStorage.getItem(key);
  } catch {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

async function kvSet(key: string, value: string): Promise<void> {
  try {
    const db = await openDb();
    await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value]);
  } catch {
    // SQLite bermasalah — tulis ke AsyncStorage supaya data tidak hilang.
    // Nilai ini tetap terbaca lewat fallback di kvGet.
    await AsyncStorage.setItem(key, value);
  }
}

/**
 * Store kunci-nilai yang dipakai seluruh aplikasi — bentuknya sama
 * dengan KeyValueStore di summarySnapshots.ts / notificationState.ts,
 * jadi pemanggil lama cukup mengganti `AsyncStorage` dengan ini.
 */
export const sqliteStore = {
  getItem: kvGet,
  setItem: kvSet,
};
