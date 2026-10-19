import { computeForecast, type Forecast } from './forecast';
import { dateISOOf, parseDateISO } from './windows';

export type QuotaPackage = {
  /** Nama paket, mis. "Kuota Utama" — ditampilkan di detail & riwayat (T2.7). */
  name: string;
  /** total kuota paket dalam bytes */
  quotaBytes: number;
  /** tanggal mulai paket, format ISO: '2026-10-16' */
  startDate: string;
  /** masa aktif paket dalam hari */
  durationDays: number;
  /** Operator paket, mis. "Telkomsel" — data tersimpan, bukan teks mati (prinsip 4). */
  operator: string;
  /** Jaringan paket, mis. "4G/5G" — data tersimpan, bukan teks mati (prinsip 4). */
  network: string;
};

/** Label "operator • jaringan" dari data paket tersimpan. */
export function operatorLabel(pkg: QuotaPackage): string {
  return `${pkg.operator} • ${pkg.network}`;
}

/** Tanggal berakhir masa aktif (eksklusif): tanggal mulai + masa aktif — hari reset. */
export function packageEndDate(pkg: QuotaPackage): Date {
  const start = parseDateISO(pkg.startDate);
  return new Date(start.getTime() + pkg.durationDays * MS_PER_DAY);
}

/**
 * Hari terakhir masa aktif (inklusif): sehari sebelum tanggal berakhir.
 * Ini yang ditampilkan sebagai "berlaku sampai" / "berakhir" — bukan
 * tanggal resetnya. Form paket (T2.7) memakai tanggal ini sebagai
 * "tanggal berakhir" yang dipilih pengguna.
 */
export function packageLastDay(pkg: QuotaPackage): Date {
  const end = packageEndDate(pkg);
  return new Date(end.getTime() - MS_PER_DAY);
}

/**
 * Durasi dalam hari dari tanggal mulai sampai tanggal berakhir
 * INKLUSIF: mulai 16 Okt, berakhir 20 Okt = 5 hari (bukan 4).
 */
export function durationDaysFromEndDate(startDateISO: string, endDateISO: string): number {
  const start = parseDateISO(startDateISO).getTime();
  const end = parseDateISO(endDateISO).getTime();
  return Math.max(1, Math.round((end - start) / MS_PER_DAY) + 1);
}

/** Paket arsip: paket lama yang sudah selesai, tersimpan di riwayat. */
export type ArchivedPackage = QuotaPackage & {
  /** Kapan paket ini diarsipkan (epoch millis). */
  archivedAt: number;
};

/**
 * Kunci stabil satu entri riwayat — dipakai hapus / pulihkan, dan
 * sebagai `key` daftar. Tanggal mulai saja tidak cukup: paket yang
 * sama bisa diarsipkan dua kali (mis. dihapus lalu dipulihkan lalu
 * dihapus lagi) dengan `archivedAt` berbeda.
 */
export function historyEntryKey(entry: ArchivedPackage): string {
  return `${entry.startDate}|${entry.archivedAt}`;
}

export type QuotaStatus = 'aman' | 'mepet' | 'kritis' | 'habis' | 'belum-mulai';

export type QuotaState = {
  usedBytes: number;
  remainingBytes: number;
  elapsedDays: number;
  totalDays: number;
  /** Rata-rata keseluruhan sejak paket mulai (deskriptif, bukan untuk prediksi). */
  dailyAvgBytes: number;
  /** sisa hari kalau pemakaian jalan di rata-rata berbobot sekarang */
  daysLeft: number;
  /** tanggal proyeksi kuota habis (null kalau belum ada pemakaian) */
  projectedRunOut: Date | null;
  packageEnd: Date;
  status: QuotaStatus;
  usedPercent: number;
  /** Prediksi berbobot (T2.3) dari hari-hari penuh dalam jendela paket. */
  forecast: Forecast;
  /**
   * Anggaran aman harian (T2.4): sisa kuota dibagi sisa hari masa aktif.
   * Memakai sisa hari FRAKSIONAL (bukan dibulatkan) supaya kuota tepat
   * habis di hari terakhir masa aktif bila dipakai tepat sebesar ini
   * setiap hari. 0 bila kuota habis atau masa aktif berakhir.
   */
  safeDailyBudgetBytes: number;
  /** True bila `now` sudah melewati akhir masa aktif paket. */
  isExpired: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Ambil pemakaian hari-hari PENUH dalam jendela paket dari bucket harian:
 * hanya bucket dengan tanggal >= tanggal mulai paket dan < hari ini.
 * Hari berjalan (hari ini) TIDAK ikut — belum selesai (T2.3). Bucket
 * sebelum paket mulai tidak ikut — itu pemakaian paket sebelumnya.
 * Urutan hasil: lama → baru, sesuai yang diminta `computeForecast`.
 */
export function fullDayBytesForPackage(
  buckets: { dateISO: string; mobileBytes: number }[],
  pkg: QuotaPackage,
  now: Date = new Date(),
): number[] {
  const hariIniISO = dateISOOf(now);
  return buckets
    .filter((b) => b.dateISO >= pkg.startDate && b.dateISO < hariIniISO)
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))
    .map((b) => Math.max(0, b.mobileBytes));
}

export function computeQuota(
  pkg: QuotaPackage,
  usedBytes: number,
  now: Date = new Date(),
  /**
   * Bucket harian (dari snapshot) untuk prediksi berbobot. Prediksi
   * memakai hari-hari penuh dalam jendela paket; tanpa bucket / tanpa
   * hari penuh, tidak ada proyeksi (bukan proyeksi linear dari hari
   * parsial — T2.3).
   */
  buckets: { dateISO: string; mobileBytes: number }[] = [],
): QuotaState {
  const start = parseDateISO(pkg.startDate);
  const packageEnd = packageEndDate(pkg);

  const elapsedDays = Math.max(
    0,
    Math.min(pkg.durationDays, (now.getTime() - start.getTime()) / MS_PER_DAY),
  );
  const remainingBytes = Math.max(0, pkg.quotaBytes - usedBytes);
  const dailyAvgBytes = elapsedDays > 0 ? usedBytes / elapsedDays : 0;
  // Prediksi berbobot (T2.3) menggantikan proyeksi linear: hanya dari
  // hari-hari penuh dalam jendela paket. Tanpa bucket / tanpa hari penuh,
  // tidak ada proyeksi — tidak mengarang angka dari hari parsial.
  const forecast = computeForecast(
    remainingBytes,
    fullDayBytesForPackage(buckets, pkg, now),
    now,
  );
  const projectedRunOut = forecast.projectedRunOut;
  const daysLeft =
    projectedRunOut !== null
      ? (projectedRunOut.getTime() - now.getTime()) / MS_PER_DAY
      : Infinity;
  const usedPercent =
    pkg.quotaBytes > 0 ? Math.min(100, (usedBytes / pkg.quotaBytes) * 100) : 0;

  // Anggaran aman harian (T2.4): sisa kuota / sisa hari (fraksional).
  const remainingDays = (packageEnd.getTime() - now.getTime()) / MS_PER_DAY;
  const safeDailyBudgetBytes =
    remainingBytes > 0 && remainingDays > 0 ? remainingBytes / remainingDays : 0;

  // Status berdasarkan LAJU (T2.5), BUKAN persen mentah. Ambang tetap
  // 70% dihapus: persen mentah tidak lagi menentukan status.
  //
  //   laju = (persen kuota terpakai) / (persen waktu berjalan)
  //   laju <= 1      -> aman   (pemakaian sejalan / lebih hemat dari jadwal ideal)
  //   1 < laju <= 1,5 -> mepet  (pemakaian di atas laju ideal)
  //   laju > 1,5      -> kritis (pemakaian jauh di atas laju ideal)
  //
  // Contoh kunci dari rencana: paket terpakai 70% pada hari terakhir
  // masa aktifnya (waktu berjalan 100%) -> laju 0,7 -> AMAN. Paket
  // terpakai 40% di seperlima masa aktifnya (waktu berjalan 20%) ->
  // laju 2,0 -> KRITIS.
  //
  // Prioritas: habis (sisa 0) > belum-mulai (now < start) > laju.
  // Bila elapsed 0 (tepat di detik paket mulai), laju tidak terdefinisi
  // -> aman. Bila masa aktif sudah berakhir dengan sisa kuota, waktu
  // berjalan sudah 100% sehingga laju = persen terpakai akhir.
  let status: QuotaStatus;
  if (remainingBytes <= 0) status = 'habis';
  else if (now < start) status = 'belum-mulai';
  else {
    const persenWaktu = pkg.durationDays > 0 ? elapsedDays / pkg.durationDays : 0;
    const persenTerpakai = pkg.quotaBytes > 0 ? usedBytes / pkg.quotaBytes : 0;
    const laju = persenWaktu > 0 ? persenTerpakai / persenWaktu : 0;
    if (laju > 1.5) status = 'kritis';
    else if (laju > 1) status = 'mepet';
    else status = 'aman';
  }

  return {
    usedBytes,
    remainingBytes,
    elapsedDays,
    totalDays: pkg.durationDays,
    dailyAvgBytes,
    daysLeft,
    projectedRunOut,
    packageEnd,
    status,
    usedPercent,
    forecast,
    safeDailyBudgetBytes,
    isExpired: now.getTime() >= packageEnd.getTime(),
  };
}

export function statusLabel(status: QuotaStatus): string {
  switch (status) {
    case 'aman':
      return 'aman';
    case 'mepet':
      return 'mepet — pemakaian di atas laju ideal';
    case 'kritis':
      return 'kritis — pemakaian jauh di atas laju ideal';
    case 'habis':
      return 'kuota habis';
    case 'belum-mulai':
      return 'paket belum mulai';
  }
}
