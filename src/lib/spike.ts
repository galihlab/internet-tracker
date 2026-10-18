// Deteksi lonjakan pemakaian (T2.6) — logika murni, tanpa dependensi
// React Native / penyimpanan lokal, supaya bisa diuji unit dengan node:test.
//
// Dua aturan (keduanya menghasilkan SATU entri per kejadian):
//
// 1. Lonjakan harian: pemakaian hari ini melewati 2x median 7 hari penuh
//    SEBELUM hari ini, dan pemeriksaan terjadi SEBELUM TENGAH HARI.
//    "Sebelum tengah hari" dibaca harfiah: bila sebelum pukul 12:00
//    pemakaian sudah 2x lipat hari biasa, itu peringatan dini — siang
//    harinya pemakaian besar sudah tidak lagi mengejutkan. Median
//    membutuhkan minimal 3 hari penuh sebelumnya supaya stabil; median
//    nol (tidak ada pemakaian tercatat) tidak pernah memicu.
// 2. Aplikasi dominan: satu aplikasi menyumbang lebih dari separuh
//    pemakaian hari ini. Sejak T3.3 penyebutnya = total SELULER per
//    aplikasi hari ini (angka per aplikasi kini terpecah per jaringan,
//    jadi tidak lagi dibandingkan dengan penyebut yang salah). Entri
//    tanpa `mobileBytes` (data lama) jatuh ke `bytes` gabungan.
//
// Setiap temuan WAJIB membawa angka penyebabnya (hari ini, median /
// ambang, aplikasi + pangsa). Tidak ada peringatan tanpa angka.

import { formatBytes, formatPercent } from './format';

export type SpikeAppToday = {
  packageName: string;
  label: string;
  bytes: number;
  /** Seluler hari ini (T3.3) — bila ada, dipakai sebagai nilai aturan 2. */
  mobileBytes?: number;
};

export type SpikeInput = {
  /** Seluler hari ini sejak tengah malam. */
  todayMobileBytes: number;
  /** Seluler 7 hari penuh sebelum hari ini (lama → baru). */
  previousFullDaysMobileBytes: number[];
  /** Pemakaian per aplikasi pada hari ini. */
  perAppToday: SpikeAppToday[];
  now: Date;
};

export type SpikeFinding = {
  kind: 'lonjakan-harian' | 'aplikasi-dominan';
  /** Kunci dedup: satu kejadian = satu entri, refresh tidak menduplikasi. */
  dedupKey: string;
  /** Tanggal lokal 'YYYY-MM-DD' kejadian. */
  dateISO: string;
  title: string;
  /** Kalimat berangka penyebabnya. */
  detail: string;
  todayMobileBytes: number;
  /** Median 7 hari sebelumnya (aturan 1) — null untuk aturan 2. */
  medianBytes: number | null;
  appPackageName?: string;
  appLabel?: string;
  appBytes?: number;
  /** Pangsa aplikasi terhadap total per aplikasi hari ini, dalam persen. */
  appSharePercent?: number;
};

/** Median (nilai tengah; rata-rata dua nilai tengah bila genap). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function dateISOOfLocal(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function detectSpikes(input: SpikeInput): SpikeFinding[] {
  const { todayMobileBytes, previousFullDaysMobileBytes, perAppToday, now } = input;
  const dateISO = dateISOOfLocal(now);
  const temuan: SpikeFinding[] = [];

  // Aturan 1: lonjakan harian sebelum tengah hari.
  if (
    now.getHours() < 12 &&
    previousFullDaysMobileBytes.length >= 3 &&
    todayMobileBytes > 0
  ) {
    const med = median(previousFullDaysMobileBytes);
    if (med > 0 && todayMobileBytes > 2 * med) {
      temuan.push({
        kind: 'lonjakan-harian',
        dedupKey: `${dateISO}:lonjakan-harian`,
        dateISO,
        title: 'Lonjakan pemakaian hari ini',
        detail: `Pemakaian hari ini sudah ${formatBytes(todayMobileBytes)} sebelum tengah hari — lebih dari 2x median 7 hari sebelumnya (${formatBytes(med)}; ambang ${formatBytes(2 * med)}).`,
        todayMobileBytes,
        medianBytes: med,
      });
    }
  }

  // Aturan 2: satu aplikasi mendominasi hari ini (seluler).
  const nilaiApp = (a: SpikeAppToday) => Math.max(0, a.mobileBytes ?? a.bytes);
  const totalPerApp = perAppToday.reduce((sum, a) => sum + nilaiApp(a), 0);
  if (totalPerApp > 0) {
    const teratas = [...perAppToday].sort((a, b) => nilaiApp(b) - nilaiApp(a))[0];
    if (teratas && nilaiApp(teratas) > 0.5 * totalPerApp) {
      const pangsa = (nilaiApp(teratas) / totalPerApp) * 100;
      temuan.push({
        kind: 'aplikasi-dominan',
        dedupKey: `${dateISO}:aplikasi-dominan:${teratas.packageName}`,
        dateISO,
        title: `${teratas.label} mendominasi hari ini`,
        detail: `${teratas.label} memakai ${formatBytes(nilaiApp(teratas))} seluler — ${formatPercent(nilaiApp(teratas), totalPerApp)} dari pemakaian seluler hari ini (${formatBytes(totalPerApp)}).`,
        todayMobileBytes,
        medianBytes: null,
        appPackageName: teratas.packageName,
        appLabel: teratas.label,
        appBytes: nilaiApp(teratas),
        appSharePercent: pangsa,
      });
    }
  }

  return temuan;
}
