// Prediksi kuota berbobot (T2.3) — logika murni, tanpa dependensi
// React Native / native, supaya bisa diuji unit dengan node:test.
//
// Aturan yang dikunci:
//
// - Hanya hari PENUH yang dihitung: hari kalender yang sudah selesai
//   (tanggal < hari ini). Hari berjalan yang belum selesai TIDAK
//   dihitung sebagai hari penuh — pemakaiannya masih parsial dan akan
//   mengecilkan rata-rata bila ikut dihitung.
// - Rata-rata berbobot: tiga hari penuh terakhir berbobot 2, hari-hari
//   sebelumnya berbobot 1. Pemakaian terakhir lebih mewakili laju
//   sekarang daripada pemakaian minggu lalu.
// - Rentang, bukan satu tanggal palsu-presisi: skenario hemat memakai
//   persentil bawah (P25) pemakaian harian — kuota habis paling lambat;
//   skenario boros memakai persentil atas (P75) — kuota habis paling
//   cepat. Persentil dihitung dengan metode nearest-rank.
// - Bila belum ada satu pun hari penuh, tidak ada angka: pemanggil
//   menampilkan "Prediksi muncul setelah satu hari penuh tercatat".

export type Forecast = {
  /** True bila ada minimal satu hari penuh untuk memprediksi. */
  hasEnoughData: boolean;
  /** Jumlah hari penuh yang dipakai. */
  fullDaysCount: number;
  /** Rata-rata berbobot pemakaian harian (bytes/hari). */
  weightedAvgBytes: number;
  /** Tanggal proyeksi kuota habis pada rata-rata berbobot (null bila laju nol). */
  projectedRunOut: Date | null;
  /** Skenario hemat (P25): kuota habis paling lambat (null bila laju P25 nol). */
  hematDate: Date | null;
  /** Skenario boros (P75): kuota habis paling cepat (null bila laju P75 nol). */
  borosDate: Date | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Persentil nearest-rank: nilai pada peringkat ceil(p/100 * n). */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.max(1, Math.ceil((p / 100) * sortedAsc.length));
  return sortedAsc[Math.min(sortedAsc.length, rank) - 1];
}

function projectDate(remainingBytes: number, rateBytesPerDay: number, now: Date): Date | null {
  if (!(rateBytesPerDay > 0)) return null;
  return new Date(now.getTime() + (remainingBytes / rateBytesPerDay) * MS_PER_DAY);
}

/**
 * Hitung prediksi dari sisa kuota dan daftar pemakaian hari-hari penuh
 * (urut lama → baru, hanya hari yang sudah selesai).
 */
export function computeForecast(
  remainingBytes: number,
  fullDayBytes: number[],
  now: Date = new Date(),
): Forecast {
  const kosong: Forecast = {
    hasEnoughData: false,
    fullDaysCount: fullDayBytes.length,
    weightedAvgBytes: 0,
    projectedRunOut: null,
    hematDate: null,
    borosDate: null,
  };
  if (fullDayBytes.length === 0 || remainingBytes <= 0) return kosong;

  // Bobot: tiga hari penuh terakhir berbobot 2, sisanya berbobot 1.
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < fullDayBytes.length; i += 1) {
    const bobot = i >= fullDayBytes.length - 3 ? 2 : 1;
    weightedSum += bobot * Math.max(0, fullDayBytes[i]);
    weightTotal += bobot;
  }
  const weightedAvgBytes = weightTotal > 0 ? weightedSum / weightTotal : 0;

  const sorted = [...fullDayBytes].map((b) => Math.max(0, b)).sort((a, b) => a - b);
  const p25 = percentile(sorted, 25);
  const p75 = percentile(sorted, 75);

  return {
    hasEnoughData: true,
    fullDaysCount: fullDayBytes.length,
    weightedAvgBytes,
    projectedRunOut: projectDate(remainingBytes, weightedAvgBytes, now),
    hematDate: projectDate(remainingBytes, p25, now),
    borosDate: projectDate(remainingBytes, p75, now),
  };
}
