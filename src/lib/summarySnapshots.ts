// Snapshot ringkasan (T3.6, penutup jalur ringkasan): hasil query
// ringkasan native terakhir yang BERHASIL disimpan lokal per kunci
// jendela yang stabil. Jika query native gagal, angka terakhir yang
// tersimpan ditampilkan dengan cap waktu "terakhir diperbarui", bukan
// diganti data contoh secara diam-diam.
//
// Modul ini MURNI (tanpa AsyncStorage / React Native) supaya bisa diuji
// unit dengan node:test: penyimpanan disuntik lewat `KeyValueStore`
// (di aplikasi: AsyncStorage). Kunci jendela TIDAK memakai rentang
// milidetik mentah — jendela terbuka ("sampai sekarang") dikunci oleh
// tanggal mulai saja, supaya snapshot benar-benar terpakai pada query
// berikutnya; jendela tertutup dikunci oleh tanggal mulai + tanggal akhir.

import type { AppUsage, UsageSummary } from './usageStats';
import { dateISOOf, startOfDayMillis } from './windows';

/** Kunci blob snapshot ringkasan di AsyncStorage. */
export const SUMMARY_SNAPSHOTS_KEY = '@kuota-tracker:summary-snapshots:v1';

/** Snapshot tersimpan: satu ringkasan native terakhir per jendela. */
export type SummarySnapshot = {
  /** Kapan snapshot terakhir berhasil disegarkan (epoch millis). */
  updatedAt: number;
  /** Ringkasan native yang tersimpan (source selalu 'native'). */
  summary: UsageSummary;
};

/** Penyimpanan kunci-nilai minimal (AsyncStorage memenuhi bentuk ini). */
export type KeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

/** Umur maksimum snapshot: entri lebih tua dari ini dibuang saat simpan. */
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/** Jumlah maksimum entri snapshot yang dipertahankan. */
const MAX_ENTRIES = 200;
/** Jendela dianggap "terbuka sampai sekarang" bila ujungnya sedekat ini. */
const OPEN_WINDOW_TOLERANCE_MS = 60 * 60 * 1000;

/**
 * Kunci jendela yang stabil untuk satu rentang [start, end).
 * - Jendela terbuka (end ≈ sekarang, hari yang sama): `terbuka:<tgl-mulai>`.
 *   Query berikutnya pada detik/jam berbeda memakai kunci yang sama,
 *   jadi snapshot terpakai — dan snapshot kemarin tetap terpakai hari
 *   ini (dengan cap waktunya) bila query gagal.
 * - Jendela tertutup (end tepat tengah malam): `tertutup:<mulai>:<akhir>`.
 * - Jendela parsial lain (mis. kemarin pada jam yang sama):
 *   `parsial:<mulai>:<tanggal-akhir>`.
 * Dua jendela dengan tanggal mulai dan jenis ujung yang sama memakai
 * kunci yang sama karena rentangnya memang sama (mis. jendela paket
 * dan periode 7 hari yang kebetulan mulai pada tanggal yang sama).
 */
export function summaryWindowKey(start: number, end: number, now: number = Date.now()): string {
  const mulaiISO = dateISOOf(new Date(start));
  const akhir = new Date(end);
  if (
    end <= now &&
    now - end < OPEN_WINDOW_TOLERANCE_MS &&
    dateISOOf(akhir) === dateISOOf(new Date(now))
  ) {
    return `terbuka:${mulaiISO}`;
  }
  if (end === startOfDayMillis(akhir)) {
    return `tertutup:${mulaiISO}:${dateISOOf(akhir)}`;
  }
  return `parsial:${mulaiISO}:${dateISOOf(akhir)}`;
}

/** Angka valid untuk snapshot: berhingga dan tidak negatif. */
function angkaValid(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/**
 * Validasi satu entri snapshot dari penyimpanan. Entri per aplikasi
 * yang rusak dibuang satu per satu; entri yang bentuk dasarnya rusak
 * (bukan ringkasan native yang lengkap) ditolak seluruhnya. Data
 * contoh TIDAK PERNAH valid sebagai snapshot: entri bersumber
 * 'sample' / 'snapshot' / 'empty' ditolak.
 */
export function normalizeStoredSnapshot(raw: unknown): SummarySnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entri = raw as Partial<SummarySnapshot> & { summary?: Partial<UsageSummary> };
  const ringkasan = entri.summary;
  if (typeof entri.updatedAt !== 'number' || !Number.isFinite(entri.updatedAt)) return null;
  if (typeof ringkasan !== 'object' || ringkasan === null) return null;
  // Hanya ringkasan native yang boleh tersimpan — bukan data contoh.
  if (ringkasan.source !== 'native') return null;
  if (
    !angkaValid(ringkasan.wifiBytes) ||
    !angkaValid(ringkasan.mobileBytes) ||
    !angkaValid(ringkasan.totalBytes) ||
    typeof ringkasan.periodStart !== 'number' ||
    typeof ringkasan.periodEnd !== 'number'
  ) {
    return null;
  }
  if (!Array.isArray(ringkasan.perApp)) return null;
  const perApp: AppUsage[] = [];
  for (const a of ringkasan.perApp) {
    if (
      typeof a === 'object' &&
      a !== null &&
      typeof (a as Partial<AppUsage>).packageName === 'string' &&
      typeof (a as Partial<AppUsage>).label === 'string' &&
      angkaValid((a as Partial<AppUsage>).bytes) &&
      angkaValid((a as Partial<AppUsage>).mobileBytes) &&
      angkaValid((a as Partial<AppUsage>).wifiBytes)
    ) {
      const e = a as AppUsage;
      perApp.push({
        packageName: e.packageName,
        label: e.label,
        bytes: e.bytes,
        mobileBytes: e.mobileBytes,
        wifiBytes: e.wifiBytes,
      });
    }
  }
  return {
    updatedAt: entri.updatedAt,
    summary: {
      wifiBytes: ringkasan.wifiBytes,
      mobileBytes: ringkasan.mobileBytes,
      totalBytes: ringkasan.totalBytes,
      periodStart: ringkasan.periodStart,
      periodEnd: ringkasan.periodEnd,
      perApp,
      source: 'native',
      fromSnapshot: false,
      updatedAt: entri.updatedAt,
    },
  };
}

/** Buang entri kedaluwarsa dan batasi jumlah entri (terbaru dipertahankan). */
export function pruneSummarySnapshots(
  semua: Record<string, SummarySnapshot>,
  now: number = Date.now(),
): Record<string, SummarySnapshot> {
  const segar = Object.entries(semua).filter(([, e]) => now - e.updatedAt <= RETENTION_MS);
  if (segar.length <= MAX_ENTRIES) return Object.fromEntries(segar);
  segar.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  return Object.fromEntries(segar.slice(0, MAX_ENTRIES));
}

/** Muat seluruh peta snapshot (objek kosong bila belum ada / rusak). */
export async function loadSummarySnapshots(
  store: KeyValueStore,
): Promise<Record<string, SummarySnapshot>> {
  try {
    const raw = await store.getItem(SUMMARY_SNAPSHOTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const hasil: Record<string, SummarySnapshot> = {};
    for (const [kunci, nilai] of Object.entries(parsed)) {
      const entri = normalizeStoredSnapshot(nilai);
      if (entri) hasil[kunci] = entri;
    }
    return hasil;
  } catch {
    return {};
  }
}

/** Muat snapshot untuk satu kunci jendela (null bila belum ada / rusak). */
export async function loadSummarySnapshot(
  store: KeyValueStore,
  kunci: string,
): Promise<SummarySnapshot | null> {
  const semua = await loadSummarySnapshots(store);
  return semua[kunci] ?? null;
}

/**
 * Simpan ringkasan sebagai snapshot untuk satu kunci jendela.
 * Snapshot BARU menimpa yang lama untuk kunci yang sama. Data contoh
 * TIDAK PERNAH disimpan: ringkasan bersumber selain 'native' (sample /
 * snapshot / empty) ditolak diam-diam. Gagal tulis penyimpanan tidak
 * melempar — data segar tetap dipakai di layar ini.
 */
export async function saveSummarySnapshot(
  store: KeyValueStore,
  kunci: string,
  ringkasan: UsageSummary,
  now: number = Date.now(),
): Promise<void> {
  // Penjaga utama T3.6: data contoh tidak boleh menjadi snapshot.
  if (ringkasan.source !== 'native') return;
  const entri = normalizeStoredSnapshot({ updatedAt: now, summary: ringkasan });
  if (!entri) return;
  try {
    const semua = await loadSummarySnapshots(store);
    semua[kunci] = entri;
    await store.setItem(
      SUMMARY_SNAPSHOTS_KEY,
      JSON.stringify(pruneSummarySnapshots(semua, now)),
    );
  } catch {
    // Gagal simpan — snapshot lama (bila ada) dipakai berikutnya.
  }
}

/**
 * Ubah snapshot tersimpan menjadi ringkasan untuk ditampilkan: sumber
 * 'snapshot' + penanda fromSnapshot + cap waktu snapshot. Rentang
 * periode yang dikembalikan adalah rentang snapshot (sampai
 * `updatedAt`), BUKAN rentang yang diminta — angkanya memang hanya
 * mencakup sampai cap waktu itu.
 */
export function snapshotToSummary(snapshot: SummarySnapshot): UsageSummary {
  return {
    ...snapshot.summary,
    source: 'snapshot',
    fromSnapshot: true,
    updatedAt: snapshot.updatedAt,
  };
}

/**
 * Fallback yang jujur bila query native gagal dan TIDAK ADA snapshot:
 * angka nol dengan sumber 'empty' — bukan data contoh. UI membedakan
 * 'empty' dari 'native' supaya tidak menampilkan nol sebagai angka asli.
 */
export function emptySummary(
  start: number,
  end: number,
  now: number = Date.now(),
): UsageSummary {
  return {
    wifiBytes: 0,
    mobileBytes: 0,
    totalBytes: 0,
    periodStart: start,
    periodEnd: end,
    perApp: [],
    source: 'empty',
    fromSnapshot: false,
    updatedAt: now,
  };
}
