import AsyncStorage from '@react-native-async-storage/async-storage';
import { GB } from './format';
import type { ArchivedPackage, QuotaPackage } from './quota';

/**
 * Pengaturan tersimpan: paket, nama pengguna, opsi notifikasi, dan
 * status welcome sudah dilihat. Disimpan sebagai satu blob JSON supaya
 * pembacaan dan penulisan selalu atomik.
 */
export type StoredSettings = {
  pkg: QuotaPackage;
  /** Riwayat paket lama yang sudah selesai (T2.7) — terbaru di depan. */
  history: ArchivedPackage[];
  /** Nama pengguna untuk sapaan; string kosong berarti belum diisi. */
  userName: string;
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
  /** True setelah welcome diselesaikan sekali. */
  welcomeSeen: boolean;
};

const SETTINGS_KEY = '@kuota-tracker:settings:v1';

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
    notificationsEnabled: true,
    notificationThresholds: [...NOTIFICATION_THRESHOLD_OPTIONS],
    dailySummaryEnabled: true,
    dailySummaryHour: 20,
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
 * dipakai.
 */
function parseSettings(raw: string | null): StoredSettings {
  const fallback = defaultSettings();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings> & {
      pkg?: Partial<QuotaPackage>;
      history?: Partial<ArchivedPackage>[];
      /** Bidang blob lama (sebelum T4.1): satu ambang, untuk migrasi. */
      notificationThreshold?: unknown;
      notificationThresholds?: unknown;
    };
    const pkg: Partial<QuotaPackage> = parsed.pkg ?? {};
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
                operator: typeof h.operator === 'string' ? h.operator : fallback.pkg.operator,
                network: typeof h.network === 'string' ? h.network : fallback.pkg.network,
                archivedAt: h.archivedAt,
              },
            ];
          }
          return [];
        })
      : [];
    return {
      pkg: {
        // Migrasi aman: blob lama yang belum punya nama memakai bawaan
        // "Kuota Utama" — bidang lain yang valid tetap dipakai.
        name:
          typeof pkg.name === 'string' && pkg.name.trim().length > 0
            ? pkg.name.trim()
            : fallback.pkg.name,
        quotaBytes:
          typeof pkg.quotaBytes === 'number' && Number.isFinite(pkg.quotaBytes) && pkg.quotaBytes > 0
            ? pkg.quotaBytes
            : fallback.pkg.quotaBytes,
        startDate: isValidDateISO(pkg.startDate) ? pkg.startDate : fallback.pkg.startDate,
        durationDays:
          typeof pkg.durationDays === 'number' &&
          Number.isInteger(pkg.durationDays) &&
          pkg.durationDays > 0
            ? pkg.durationDays
            : fallback.pkg.durationDays,
        // Migrasi aman: blob lama yang belum punya operator/jaringan
        // memakai bawaan — bidang lain yang valid tetap dipakai.
        operator:
          typeof pkg.operator === 'string' && pkg.operator.trim().length > 0
            ? pkg.operator.trim()
            : fallback.pkg.operator,
        network:
          typeof pkg.network === 'string' && pkg.network.trim().length > 0
            ? pkg.network.trim()
            : fallback.pkg.network,
      },
      history,
      userName: typeof parsed.userName === 'string' ? parsed.userName : fallback.userName,
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
      welcomeSeen: typeof parsed.welcomeSeen === 'boolean' ? parsed.welcomeSeen : fallback.welcomeSeen,
    };
  } catch {
    // Blob rusak / bukan JSON — mulai dari bawaan.
    return fallback;
  }
}

/** Muat pengaturan tersimpan (atau bawaan bila belum ada). */
export async function loadSettings(): Promise<StoredSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return parseSettings(raw);
  } catch {
    // Penyimpanan tidak bisa dibaca — pakai bawaan supaya aplikasi jalan.
    return defaultSettings();
  }
}

/** Simpan seluruh pengaturan. */
export async function saveSettings(settings: StoredSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
