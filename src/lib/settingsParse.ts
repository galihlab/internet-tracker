// Bentuk + validasi pengaturan tersimpan — MURNI, tanpa dependensi
// React Native / Expo / penyimpanan lokal, supaya bisa diuji unit
// dengan node:test (pola yang sama seperti notificationState.ts).
// storage.ts memakai modul ini untuk baca/tulis lewat SQLite.

import { GB } from './format';
import type { ArchivedPackage, QuotaPackage } from './quota';

/**
 * Pengaturan tersimpan: paket, nama pengguna, opsi notifikasi, dan
 * status welcome sudah dilihat. Disimpan sebagai satu blob JSON supaya
 * pembacaan dan penulisan selalu atomik.
 */
export type StoredSettings = {
  /**
   * Paket seluler aktif. NULL = tidak ada paket aktif (dihapus
   * pengguna) — Beranda menyembunyikan seksi "Paket seluler" dan
   * peringatan ambang kuota tidak berlaku sampai paket baru ditambah.
   * Pengingat internet (batas harian, batas per aplikasi, pemakaian
   * malam) TIDAK bergantung pada paket dan tetap jalan.
   */
  pkg: QuotaPackage | null;
  /** Riwayat paket lama yang sudah selesai (T2.7) — terbaru di depan. */
  history: ArchivedPackage[];
  /** Nama pengguna untuk sapaan; string kosong berarti belum diisi. */
  userName: string;
  /**
   * Foto profil (data URI JPEG base64, dipangkas 1:1) — tampil sebagai
   * avatar di Beranda. String kosong berarti belum diisi.
   */
  profilePhoto: string;
  /**
   * Notifikasi kuota aktif atau tidak (T4.1). Mematikan ini menonaktifkan
   * jalur T4.2 (peringatan ambang, pengingat prediksi kritis, ringkasan
   * harian). Peringatan lonjakan T2.6 TIDAK ikut mati — itu entri daftar
   * dalam aplikasi yang tidak pernah berbunyi, dan jalurnya terpisah.
   */
  notificationsEnabled: boolean;
  /**
   * Ambang peringatan aktif (T4.1 + T4.2): subset dari [50, 80, 100].
   * Setiap ambang yang aktif berbunyi tepat sekali per paket begitu
   * kuota terpakai mencapai ambang itu. Daftar kosong = tidak ada
   * peringatan ambang (tetapi peringatan lonjakan T2.6 tetap jalan,
   * karena sumbernya bukan ambang).
   */
  notificationThresholds: number[];
  /** Ringkasan harian aktif atau tidak (T4.2). */
  dailySummaryEnabled: boolean;
  /** Jam pengiriman ringkasan harian (0–23, waktu lokal perangkat). */
  dailySummaryHour: number;
  /**
   * Batas harian TOTAL internet (seluler + Wi-Fi) dalam bytes.
   * 0 = mati. Bila tercapai, bunyi sekali hari itu.
   */
  dailyInternetBudgetBytes: number;
  /**
   * Batas harian per aplikasi (total seluler + Wi-Fi aplikasi itu).
   * Diatur dari detail aplikasi; kosong = tidak ada batas per aplikasi.
   */
  perAppBudgets: PerAppBudget[];
  /**
   * Pengingat pemakaian malam: bila pemakaian total 00:00–06:00
   * mencapai ambang, beri tahu pagi harinya (sekali per malam).
   */
  overnightAlertEnabled: boolean;
  /** True setelah welcome diselesaikan sekali. */
  welcomeSeen: boolean;
};

/** Batas harian satu aplikasi: paket + label tampilan + batas bytes. */
export type PerAppBudget = {
  packageName: string;
  label: string;
  budgetBytes: number;
};

/** Tanggal lokal hari ini, format ISO 'YYYY-MM-DD'. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ambang peringatan yang tersedia (T4.2): 50%, 80%, 100% kuota terpakai. */
export const NOTIFICATION_THRESHOLD_OPTIONS = [50, 80, 100] as const;

/** Nilai bawaan saat belum ada yang tersimpan (paket lama: 13 GB / 5 hari). */
export function defaultSettings(): StoredSettings {
  return {
    pkg: {
      name: 'Kuota Utama',
      quotaBytes: 13 * GB,
      startDate: todayISO(),
      durationDays: 5,
      operator: 'Telkomsel',
      network: '4G/5G',
    },
    history: [],
    userName: '',
    profilePhoto: '',
    notificationsEnabled: true,
    notificationThresholds: [...NOTIFICATION_THRESHOLD_OPTIONS],
    dailySummaryEnabled: true,
    dailySummaryHour: 20,
    dailyInternetBudgetBytes: 0,
    perAppBudgets: [],
    overnightAlertEnabled: true,
    welcomeSeen: false,
  };
}

function isValidDateISO(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Migrasi ambang (T4.1): blob lama menyimpan SATU ambang
 * `notificationThreshold` (mis. 80) — dipetakan ke ambang-ambang
 * 50/80/100 yang >= nilai lama ([80, 100] untuk 80), supaya perilaku
 * "beri tahu mulai X%" tetap dipertahankan. Blob baru memakai
 * `notificationThresholds` (daftar, boleh kosong = semua peringatan
 * ambang mati). Daftar yang berisi nilai di luar 50/80/100 dibersihkan;
 * bukan daftar dan bukan angka lama -> bawaan.
 */
function migrasiAmbang(
  baru: unknown,
  lama: unknown,
  bawaan: number[],
): number[] {
  if (Array.isArray(baru)) {
    return [
      ...new Set(
        baru.filter(
          (t): t is number =>
            typeof t === 'number' &&
            (NOTIFICATION_THRESHOLD_OPTIONS as readonly number[]).includes(t),
        ),
      ),
    ].sort((a, b) => a - b);
  }
  if (typeof lama === 'number' && Number.isFinite(lama)) {
    return NOTIFICATION_THRESHOLD_OPTIONS.filter((t) => t >= lama);
  }
  return bawaan;
}

/**
 * Validasi per-bidang: blob lama / rusak tidak boleh merusak aplikasi —
 * bidang yang tidak valid kembali ke bawaan, bidang yang valid tetap
 * dipakai. Diekspor untuk uji unit (parse tidak menyentuh penyimpanan).
 */
export function parseSettings(raw: string | null): StoredSettings {
  const fallback = defaultSettings();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings> & {
      pkg?: Partial<QuotaPackage> | null;
      history?: Partial<ArchivedPackage>[];
      /** Bidang blob lama (sebelum T4.1): satu ambang, untuk migrasi. */
      notificationThreshold?: unknown;
      notificationThresholds?: unknown;
      perAppBudgets?: Partial<PerAppBudget>[];
    };
    // pkg null eksplisit = tidak ada paket aktif (dihapus pengguna) —
    // dipertahankan null, BUKAN diganti paket bawaan. pkg hilang
    // (blob lama tanpa bidang pkg) tetap jatuh ke paket bawaan.
    const pkgRaw = parsed.pkg;
    // Paket bawaan untuk migrasi bidang-bidang lama — selalu non-null
    // (sama seperti pkg di defaultSettings; `??` hanya untuk meyakinkan
    // type checker karena StoredSettings.pkg boleh null).
    const bawaan: QuotaPackage = fallback.pkg ?? {
      name: 'Kuota Utama',
      quotaBytes: 13 * GB,
      startDate: todayISO(),
      durationDays: 5,
      operator: 'Telkomsel',
      network: '4G/5G',
    };
    const pkg: QuotaPackage | null =
      pkgRaw === null
        ? null
        : {
            // Migrasi aman: blob lama yang belum punya nama memakai bawaan
            // "Kuota Utama" — bidang lain yang valid tetap dipakai.
            name:
              typeof pkgRaw?.name === 'string' && pkgRaw.name.trim().length > 0
                ? pkgRaw.name.trim()
                : bawaan.name,
            quotaBytes:
              typeof pkgRaw?.quotaBytes === 'number' &&
              Number.isFinite(pkgRaw.quotaBytes) &&
              pkgRaw.quotaBytes > 0
                ? pkgRaw.quotaBytes
                : bawaan.quotaBytes,
            startDate:
              isValidDateISO(pkgRaw?.startDate) && pkgRaw?.startDate
                ? pkgRaw.startDate
                : bawaan.startDate,
            durationDays:
              typeof pkgRaw?.durationDays === 'number' &&
              Number.isInteger(pkgRaw.durationDays) &&
              pkgRaw.durationDays > 0
                ? pkgRaw.durationDays
                : bawaan.durationDays,
            // Migrasi aman: blob lama yang belum punya operator/jaringan
            // memakai bawaan — bidang lain yang valid tetap dipakai.
            operator:
              typeof pkgRaw?.operator === 'string' && pkgRaw.operator.trim().length > 0
                ? pkgRaw.operator.trim()
                : bawaan.operator,
            network:
              typeof pkgRaw?.network === 'string' && pkgRaw.network.trim().length > 0
                ? pkgRaw.network.trim()
                : bawaan.network,
          };
    // Riwayat: hanya entri yang bentuknya paket valid yang dipertahankan.
    const history: ArchivedPackage[] = Array.isArray(parsed.history)
      ? parsed.history.flatMap((h) => {
          if (
            typeof h?.name === 'string' &&
            typeof h?.quotaBytes === 'number' &&
            Number.isFinite(h.quotaBytes) &&
            h.quotaBytes > 0 &&
            isValidDateISO(h?.startDate) &&
            typeof h?.durationDays === 'number' &&
            Number.isInteger(h.durationDays) &&
            h.durationDays > 0 &&
            typeof h?.archivedAt === 'number'
          ) {
            return [
              {
                name: h.name,
                quotaBytes: h.quotaBytes,
                startDate: h.startDate as string,
                durationDays: h.durationDays,
                operator: typeof h.operator === 'string' ? h.operator : bawaan.operator,
                network: typeof h.network === 'string' ? h.network : bawaan.network,
                archivedAt: h.archivedAt,
              },
            ];
          }
          return [];
        })
      : [];
    // Batas per aplikasi: hanya entri berbentuk valid yang dipertahankan.
    const perAppBudgets: PerAppBudget[] = Array.isArray(parsed.perAppBudgets)
      ? parsed.perAppBudgets.flatMap((b) => {
          if (
            typeof b?.packageName === 'string' &&
            b.packageName.length > 0 &&
            typeof b?.label === 'string' &&
            typeof b?.budgetBytes === 'number' &&
            Number.isFinite(b.budgetBytes) &&
            b.budgetBytes > 0
          ) {
            return [
              { packageName: b.packageName, label: b.label, budgetBytes: b.budgetBytes },
            ];
          }
          return [];
        })
      : [];
    return {
      pkg,
      history,
      userName: typeof parsed.userName === 'string' ? parsed.userName : fallback.userName,
      profilePhoto:
        typeof parsed.profilePhoto === 'string' ? parsed.profilePhoto : fallback.profilePhoto,
      notificationsEnabled:
        typeof parsed.notificationsEnabled === 'boolean'
          ? parsed.notificationsEnabled
          : fallback.notificationsEnabled,
      notificationThresholds: migrasiAmbang(
        parsed.notificationThresholds,
        parsed.notificationThreshold,
        fallback.notificationThresholds,
      ),
      dailySummaryEnabled:
        typeof parsed.dailySummaryEnabled === 'boolean'
          ? parsed.dailySummaryEnabled
          : fallback.dailySummaryEnabled,
      dailySummaryHour:
        typeof parsed.dailySummaryHour === 'number' &&
        Number.isInteger(parsed.dailySummaryHour) &&
        parsed.dailySummaryHour >= 0 &&
        parsed.dailySummaryHour <= 23
          ? parsed.dailySummaryHour
          : fallback.dailySummaryHour,
      dailyInternetBudgetBytes:
        typeof parsed.dailyInternetBudgetBytes === 'number' &&
        Number.isFinite(parsed.dailyInternetBudgetBytes) &&
        parsed.dailyInternetBudgetBytes >= 0
          ? parsed.dailyInternetBudgetBytes
          : fallback.dailyInternetBudgetBytes,
      perAppBudgets,
      overnightAlertEnabled:
        typeof parsed.overnightAlertEnabled === 'boolean'
          ? parsed.overnightAlertEnabled
          : fallback.overnightAlertEnabled,
      welcomeSeen: typeof parsed.welcomeSeen === 'boolean' ? parsed.welcomeSeen : fallback.welcomeSeen,
    };
  } catch {
    // Blob rusak / bukan JSON — mulai dari bawaan.
    return fallback;
  }
}
