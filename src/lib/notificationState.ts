// Status pengiriman notifikasi (T4.2) — ambang / prediksi kritis yang
// sudah berbunyi, dan tanggal terakhir ringkasan harian terkirim.
// Store-injected seperti summarySnapshots.ts: pemanggil mengoper
// AsyncStorage, pengujian Node mengoper toko palsu. TIDAK ada impor
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
 * Tandai kunci-kunci dedup sudah berbunyi. Kunci yang sudah ada tidak
 * diduplikasi. Mengembalikan status terbaru.
 */
export async function markNotificationsFired(
  store: Store,
  ids: string[],
): Promise<NotificationState> {
  const state = await loadNotificationState(store);
  const sudah = new Set(state.firedIds);
  for (const id of ids) {
    if (!sudah.has(id)) {
      sudah.add(id);
      state.firedIds.push(id);
    }
  }
  await saveNotificationState(store, state);
  return state;
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
export async function resetNotificationState(store: Store): Promise<void> {
  await saveNotificationState(store, kosong());
}
