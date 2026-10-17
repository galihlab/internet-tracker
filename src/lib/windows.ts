// Jendela data (T2.1) — tiga jendela yang tidak boleh dicampur lagi:
//
// 1. Jendela paket   : seluler sejak tanggal mulai paket sampai sekarang.
//                     Dipakai kartu paket, welcome, dan detail paket.
// 2. Jendela hari ini: sejak tengah malam hari ini sampai sekarang.
//                     Dipakai kartu Penggunaan Hari Ini.
// 3. Riwayat harian  : bucket per hari kalender (satu bucket per tanggal).
//                     Dipakai grafik harian dan prediksi.
//
// Di luar ketiganya masih ada satu jendela lagi yang dinamai eksplisit:
// jendela periode terpilih (Hari ini / 7 hari / 30 hari) untuk tab
// Statistik dan Aplikasi — lihat `periodToRange` di usageStats.ts.
// Jendela periode TIDAK dipakai untuk angka paket: angka paket selalu
// dari jendela paket, apa pun periode yang dipilih di Statistik.
//
// Semua jendela memakai waktu lokal perangkat dan berbentuk rentang
// [start, end) dalam milidetik epoch.

export type DataWindow = {
  /** Awal rentang inklusif, milidetik epoch. */
  start: number;
  /** Akhir rentang eksklusif, milidetik epoch. */
  end: number;
};

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tengah malam lokal pada tanggal yang sama dengan `date`. */
export function startOfDayMillis(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Tanggal lokal dalam format ISO 'YYYY-MM-DD'. */
export function dateISOOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Tanggal lokal tengah malam dari string ISO 'YYYY-MM-DD'. */
export function parseDateISO(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Jendela paket: sejak tengah malam tanggal mulai paket sampai sekarang.
 * Bila `now` sebelum tanggal mulai, akhir tetap `now` sehingga rentangnya
 * kosong — pemakaian paket nol dan status paket 'belum-mulai'.
 */
export function packageWindow(startDateISO: string, now: Date = new Date()): DataWindow {
  return { start: startOfDayMillis(parseDateISO(startDateISO)), end: now.getTime() };
}

/** Jendela hari ini: sejak tengah malam hari ini sampai sekarang. */
export function todayWindow(now: Date = new Date()): DataWindow {
  return { start: startOfDayMillis(now), end: now.getTime() };
}

/**
 * Jendela satu hari kalender penuh [tengah malam, tengah malam berikutnya).
 * Hanya dipakai untuk hari yang sudah lewat; untuk hari ini pakai
 * `todayWindow` (parsial) supaya angka tidak mengarang sisa hari.
 */
export function dayWindow(dateISO: string): DataWindow {
  const start = startOfDayMillis(parseDateISO(dateISO));
  return { start, end: start + MS_PER_DAY };
}
