// Penyimpanan peringatan dalam aplikasi — entri lonjakan (T2.6),
// ambang kuota + prediksi kritis (T4.2/T4.3) yang tersimpan di
// local DB (SQLite), bertanggal dan berangka. Daftar ini SATU SUMBER dengan
// notifikasi (T4.3): setiap notifikasi ambang/prediksi kritis membuat
// SATU entri di sini, dan lonceng Beranda menghitung entri yang belum
// dibaca. Notifikasi lokal sendiri dikirim dari notificationChecks.ts.

import { sqliteStore } from './db';
import type { SpikeFinding } from './spike';

/** Jenis entri peringatan — lonjakan (T2.6) + ambang/prediksi (T4.2) + pengingat internet (v1.3.0). */
export type AlertKind =
  | 'lonjakan-harian'
  | 'aplikasi-dominan'
  | 'ambang-kuota'
  | 'prediksi-kritis'
  | 'batas-harian'
  | 'batas-aplikasi'
  | 'pemakaian-malam';

export type Alert = {
  /**
   * Kunci dedup: satu kejadian = satu entri. Lonjakan memakai
   * SpikeFinding.dedupKey; ambang/prediksi memakai dedupKey dari
   * notifications.ts (signature paket + jenis).
   */
  id: string;
  kind: AlertKind;
  /** Tanggal lokal 'YYYY-MM-DD' kejadian. */
  dateISO: string;
  /** Kapan entri dibuat (epoch millis). */
  createdAt: number;
  title: string;
  /** Kalimat berangka penyebabnya — wajib ada, tidak ada peringatan tanpa angka. */
  detail: string;
  /**
   * Seluler hari ini saat entri dibuat (lonjakan). Opsional untuk
   * entri ambang/prediksi — penyebabnya sudah ada di `detail`.
   */
  todayMobileBytes?: number;
  /** Median 7 hari sebelumnya (aturan lonjakan 1) — null untuk aturan 2. */
  medianBytes?: number | null;
  appPackageName?: string;
  appLabel?: string;
  appBytes?: number;
  appSharePercent?: number;
  /** Ambang yang tercapai (hanya untuk 'ambang-kuota'). */
  thresholdPercent?: number;
  /** True setelah daftar /alerts dibuka (T4.3 memakai mekanisme yang sama). */
  read: boolean;
};

/** Masukan untuk satu entri baru (tanpa `read`/`createdAt` — diisi di sini). */
export type NewAlertEntry = Omit<Alert, 'read' | 'createdAt'> & {
  createdAt?: number;
};

const ALERTS_KEY = '@kuota-tracker:alerts:v1';
/** Batas entri yang disimpan — peringatan lama di luar batas dibuang. */
const MAX_ALERTS = 100;

const ALERT_KINDS: readonly string[] = [
  'lonjakan-harian',
  'aplikasi-dominan',
  'ambang-kuota',
  'prediksi-kritis',
  'batas-harian',
  'batas-aplikasi',
  'pemakaian-malam',
];

/** Muat peringatan tersimpan (atau [] bila belum ada / rusak). */
export async function loadAlerts(): Promise<Alert[]> {
  try {
    const raw = await sqliteStore.getItem(ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Alert>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is Alert =>
        typeof a?.id === 'string' &&
        typeof a?.kind === 'string' &&
        ALERT_KINDS.includes(a.kind) &&
        typeof a?.dateISO === 'string' &&
        typeof a?.title === 'string' &&
        typeof a?.detail === 'string' &&
        typeof a?.createdAt === 'number' &&
        typeof a?.read === 'boolean',
    );
  } catch {
    return [];
  }
}

async function saveAlerts(alerts: Alert[]): Promise<void> {
  try {
    await sqliteStore.setItem(ALERTS_KEY, JSON.stringify(alerts.slice(0, MAX_ALERTS)));
  } catch {
    // Gagal simpan — entri tetap tampil di layar ini; tidak tampil lagi
    // pada pembukaan berikutnya.
  }
}

/**
 * Tambahkan entri baru, dedup berdasarkan id: kejadian yang sama tidak
 * membuat entri kedua walau terdeteksi berulang kali tiap refresh.
 * Mengembalikan daftar lengkap terbaru (baru di depan).
 */
export async function addAlertEntries(
  entries: NewAlertEntry[],
  now: Date = new Date(),
): Promise<Alert[]> {
  if (entries.length === 0) return loadAlerts();
  const tersimpan = await loadAlerts();
  const ids = new Set(tersimpan.map((a) => a.id));
  const baru: Alert[] = entries
    .filter((e) => !ids.has(e.id))
    .map((e) => ({ ...e, createdAt: e.createdAt ?? now.getTime(), read: false }));
  if (baru.length === 0) return tersimpan;
  const gabungan = [...baru, ...tersimpan];
  await saveAlerts(gabungan);
  return gabungan;
}

/**
 * Tambahkan temuan lonjakan baru, dedup berdasarkan id (pembungkus
 * addAlertEntries untuk T2.6 — perilaku lama dipertahankan).
 */
export async function addAlerts(
  findings: SpikeFinding[],
  now: Date = new Date(),
): Promise<Alert[]> {
  return addAlertEntries(
    findings.map((f) => ({
      id: f.dedupKey,
      kind: f.kind,
      dateISO: f.dateISO,
      title: f.title,
      detail: f.detail,
      todayMobileBytes: f.todayMobileBytes,
      medianBytes: f.medianBytes,
      appPackageName: f.appPackageName,
      appLabel: f.appLabel,
      appBytes: f.appBytes,
      appSharePercent: f.appSharePercent,
    })),
    now,
  );
}

/** Tandai semua peringatan sudah dibaca — dipakai saat /alerts dibuka. */
export async function markAllAlertsRead(): Promise<Alert[]> {
  const tersimpan = await loadAlerts();
  const ditandai = tersimpan.map((a) => ({ ...a, read: true }));
  await saveAlerts(ditandai);
  return ditandai;
}
