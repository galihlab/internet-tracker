export type QuotaPackage = {
  /** total kuota paket dalam bytes */
  quotaBytes: number;
  /** tanggal mulai paket, format ISO: '2026-10-16' */
  startDate: string;
  /** masa aktif paket dalam hari */
  durationDays: number;
};

export type QuotaStatus = 'aman' | 'mepet' | 'kritis' | 'habis' | 'belum-mulai';

export type QuotaState = {
  usedBytes: number;
  remainingBytes: number;
  elapsedDays: number;
  totalDays: number;
  dailyAvgBytes: number;
  /** sisa hari kalau pemakaian jalan di rata-rata sekarang */
  daysLeft: number;
  /** tanggal proyeksi kuota habis (null kalau belum ada pemakaian) */
  projectedRunOut: Date | null;
  packageEnd: Date;
  status: QuotaStatus;
  usedPercent: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeQuota(
  pkg: QuotaPackage,
  usedBytes: number,
  now: Date = new Date(),
): QuotaState {
  const start = new Date(pkg.startDate);
  start.setHours(0, 0, 0, 0);
  const packageEnd = new Date(start.getTime() + pkg.durationDays * MS_PER_DAY);

  const elapsedDays = Math.max(
    0,
    Math.min(pkg.durationDays, (now.getTime() - start.getTime()) / MS_PER_DAY),
  );
  const remainingBytes = Math.max(0, pkg.quotaBytes - usedBytes);
  const dailyAvgBytes = elapsedDays > 0 ? usedBytes / elapsedDays : 0;
  const daysLeft = dailyAvgBytes > 0 ? remainingBytes / dailyAvgBytes : Infinity;
  const projectedRunOut =
    dailyAvgBytes > 0 ? new Date(now.getTime() + daysLeft * MS_PER_DAY) : null;
  const usedPercent =
    pkg.quotaBytes > 0 ? Math.min(100, (usedBytes / pkg.quotaBytes) * 100) : 0;

  let status: QuotaStatus;
  if (remainingBytes <= 0) status = 'habis';
  else if (now < start) status = 'belum-mulai';
  else if (projectedRunOut !== null && projectedRunOut < packageEnd) status = 'kritis';
  else if (usedPercent >= 70) status = 'mepet';
  else status = 'aman';

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
  };
}

export function statusLabel(status: QuotaStatus): string {
  switch (status) {
    case 'aman':
      return 'aman';
    case 'mepet':
      return 'mepet';
    case 'kritis':
      return 'kritis — diproyeksi habis sebelum masa aktif';
    case 'habis':
      return 'kuota habis';
    case 'belum-mulai':
      return 'paket belum mulai';
  }
}
