// Status pengiriman notifikasi (T4.2) — ambang / prediksi kritis yang
// sudah berbunyi, dan tanggal terakhir ringkasan harian terkirim.
// Store-injected seperti summarySnapshots.ts: pemanggil mengoper
// sqliteStore (local DB), pengujian Node mengoper toko palsu. TIDAK ada impor
// React Native / Expo di sini supaya logikanya bisa diuji di Node.

export type NotificationState = {
  /** Kunci dedup notifikasi yang sudah berbunyi (lihat notifications.ts). */
  firedIds: string[];
  /** Tanggal lokal 'YYYY-MM-DD' terakhir ringkasan harian terkirim. */
  lastDailySummaryDateISO: string | null;
};

export const NOTIFICATION_STATE_KEY = '@kuota-tracker:notification-state:v1';

type Store = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

/** Store + operasi klaim atomik (lihat db.ts). Opsional supaya toko palsu di tes tetap bisa dipakai. */
export type ClaimStore = Store & {
  claimKey?: (key: string) => Promise<boolean>;
  clearClaimKeys?: (prefix: string) => Promise<void>;
};

/** Prefix kunci klaim atomik di kv — satu kunci klaim per kunci dedup. */
export const NOTIFICATION_CLAIM_PREFIX = '@kuota-tracker:claim:v1:';

function kosong(): NotificationState {
  return { firedIds: [], lastDailySummaryDateISO: null };
}

function validasi(raw: unknown): NotificationState {
  const hasil = kosong();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return hasil;
  const obj = raw as Partial<NotificationState>;
  if (Array.isArray(obj.firedIds)) {
    hasil.firedIds = obj.firedIds.filter((id): id is string => typeof id === 'string');
  }
  if (
    typeof obj.lastDailySummaryDateISO === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(obj.lastDailySummaryDateISO)
  ) {
    hasil.lastDailySummaryDateISO = obj.lastDailySummaryDateISO;
  }
  return hasil;
}

/** Muat status pengiriman (atau kosong bila belum ada / rusak). */
export async function loadNotificationState(store: Store): Promise<NotificationState> {
  try {
    const raw = await store.getItem(NOTIFICATION_STATE_KEY);
    if (!raw) return kosong();
    return validasi(JSON.parse(raw) as unknown);
  } catch {
    return kosong();
  }
}

export async function saveNotificationState(
  store: Store,
  state: NotificationState,
): Promise<void> {
  try {
    await store.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(state));
  } catch {
    // Gagal simpan — pemeriksaan berikutnya akan mencoba lagi; dedup
    // mengandalkan penyimpanan ini, jadi kegagalan di sini bisa
    // menyebabkan bunyi ganda, tetapi tidak pernah menghilangkan data.
  }
}

/**
 * Klaim atomik satu kunci dedup — gerbang exactly-once pengiriman
 * notifikasi. Dua pelari yang bersamaan (effect foreground +
 * tugas latar per 60 menit) hanya menghasilkan SATU pemenang: yang
 * kalah tidak mengirim. Ini menutup balapan cek-di-awal /
 * tandai-di-akhir yang menyebabkan notifikasi ganda di perangkat
 * (laporan 20 Okt 2026: "Pemakaian besar semalam" berbunyi dua kali).
 *
 * Kunci yang sudah ada di firedIds (riwayat versi lama) langsung
 * ditolak tanpa menyentuh klaim. Pemenang juga dicatat ke firedIds
 * supaya pembaca lama (detektor, StatusAmbang) tetap melihatnya.
 * Tanpa claimKey atomik (toko palsu / fallback), klaim = catat-dulu
 * (jendela balapan menyempit drastis walau tak tertutup penuh).
 */
export async function claimFiredKey(store: ClaimStore, key: string): Promise<boolean> {
  const state = await loadNotificationState(store);
  if (state.firedIds.includes(key)) return false;
  if (store.claimKey) {
    const menang = await store.claimKey(NOTIFICATION_CLAIM_PREFIX + key);
    if (!menang) return false;
  }
  if (!state.firedIds.includes(key)) {
    state.firedIds.push(key);
    await saveNotificationState(store, state);
  }
  return true;
}

/** Tandai ringkasan harian untuk tanggal itu sudah terkirim. */
export async function markDailySummarySent(
  store: Store,
  dateISO: string,
): Promise<NotificationState> {
  const state = await loadNotificationState(store);
  state.lastDailySummaryDateISO = dateISO;
  await saveNotificationState(store, state);
  return state;
}

/**
 * Kosongkan status pengiriman — dipakai saat paket BARU dimulai
 * (T4.2: setiap ambang hanya berbunyi sekali PER PAKET, dan paket baru
 * adalah siklus baru). Mengubah paket di tempat (edit) TIDAK mereset:
 * tanda paket memakai signature startDate+kuota+durasi, jadi edit
 * kuota/durasi sudah memberi siklus baru lewat signature yang berubah.
 */
export async function resetNotificationState(store: ClaimStore): Promise<void> {
  await saveNotificationState(store, kosong());
  // Klaim lama ikut dibersihkan supaya siklus paket baru benar-benar
  // baru — tanpa ini, klaim dari paket lama memblokir bunyi ulang.
  try {
    await store.clearClaimKeys?.(NOTIFICATION_CLAIM_PREFIX);
  } catch {
    // Best-effort: lihat komentar kvClearClaims di db.ts.
  }
}
