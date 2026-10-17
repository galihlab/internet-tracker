// Uji unit logika Fase 2 (T2.8) — node:test + node:assert, tanpa
// dependensi React Native / modul native. Berkas .mjs mengimpor sumber
// .ts langsung (Node 24 type stripping); impor memakai ekstensi .ts
// eksplisit. Hanya logika murni yang diuji di sini (quota, forecast,
// spike, buckets). Penyimpanan AsyncStorage (alerts, snapshot) tidak
// diuji di Node — perlu lingkungan React Native.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeQuota,
  durationDaysFromEndDate,
  fullDayBytesForPackage,
  packageLastDay,
  statusLabel,
} from '../quota.ts';
import { computeForecast } from '../forecast.ts';
import { detectSpikes, median } from '../spike.ts';
import {
  mergeDailyAppBuckets,
  mergeDailyBuckets,
  sampleDailyBuckets,
} from '../buckets.ts';

const GB = 1024 ** 3;
const DAY = 24 * 60 * 60 * 1000;

// Tanggal lokal eksplisit (bukan string UTC) supaya uji tidak bergantung
// pada zona waktu mesin.
const t = (y, m, d, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0);

function pkg(over = {}) {
  return {
    name: 'Kuota Utama',
    quotaBytes: 10 * GB,
    startDate: '2026-10-10',
    durationDays: 10,
    operator: 'Telkomsel',
    network: '4G/5G',
    ...over,
  };
}

// --- computeQuota: paket belum mulai ---------------------------------------

test('paket belum mulai: status belum-mulai, sisa penuh', () => {
  const s = computeQuota(pkg({ startDate: '2026-10-20' }), 0, t(2026, 10, 16, 12));
  assert.equal(s.status, 'belum-mulai');
  assert.equal(s.remainingBytes, 10 * GB);
  assert.equal(statusLabel(s.status), 'paket belum mulai');
});

// --- computeQuota: hari pertama parsial ------------------------------------

test('hari pertama parsial: tanpa hari penuh, tidak ada proyeksi', () => {
  // Paket mulai hari ini; bucket hanya berisi hari ini (parsial).
  const buckets = [{ dateISO: '2026-10-16', mobileBytes: 1 * GB }];
  const s = computeQuota(
    pkg({ startDate: '2026-10-16', durationDays: 5 }),
    1 * GB,
    t(2026, 10, 16, 12),
    buckets,
  );
  assert.equal(s.forecast.hasEnoughData, false);
  assert.equal(s.forecast.projectedRunOut, null);
  assert.equal(s.forecast.fullDaysCount, 0);
});

test('hari pertama parsial: bucket hari ini tidak dihitung sebagai hari penuh', () => {
  const buckets = [
    { dateISO: '2026-10-16', mobileBytes: 5 * GB }, // hari ini — parsial
    { dateISO: '2026-10-15', mobileBytes: 1 * GB }, // sebelum paket mulai
  ];
  const hariPenuh = fullDayBytesForPackage(
    buckets,
    pkg({ startDate: '2026-10-16' }),
    t(2026, 10, 16, 12),
  );
  assert.deepEqual(hariPenuh, []);
});

// --- computeQuota: kuota habis ----------------------------------------------

test('kuota habis: status habis, sisa nol, anggaran nol', () => {
  const s = computeQuota(pkg(), 10 * GB, t(2026, 10, 12, 12));
  assert.equal(s.status, 'habis');
  assert.equal(s.remainingBytes, 0);
  assert.equal(s.safeDailyBudgetBytes, 0);
  assert.equal(statusLabel(s.status), 'kuota habis');
});

// --- computeQuota: masa aktif berakhir lebih dulu daripada kuota ----------

test('masa aktif berakhir lebih dulu: expired, anggaran nol', () => {
  const s = computeQuota(pkg(), 5 * GB, t(2026, 10, 21, 12));
  assert.equal(s.isExpired, true);
  assert.equal(s.safeDailyBudgetBytes, 0);
  assert.equal(s.remainingBytes, 5 * GB);
});

// --- computeQuota: rata-rata nol --------------------------------------------

test('rata-rata nol: hari penuh tercatat tapi tanpa pemakaian', () => {
  const buckets = [
    { dateISO: '2026-10-10', mobileBytes: 0 },
    { dateISO: '2026-10-11', mobileBytes: 0 },
  ];
  const s = computeQuota(pkg(), 0, t(2026, 10, 12, 12), buckets);
  assert.equal(s.forecast.hasEnoughData, true);
  assert.equal(s.forecast.weightedAvgBytes, 0);
  assert.equal(s.forecast.projectedRunOut, null);
  assert.equal(s.forecast.hematDate, null);
  assert.equal(s.forecast.borosDate, null);
});

// --- computeQuota: status berdasarkan laju (T2.5) ---------------------------

test('status laju: 70% terpakai pada hari terakhir -> aman', () => {
  const s = computeQuota(pkg(), 7 * GB, t(2026, 10, 19, 12));
  assert.equal(s.status, 'aman');
});

test('status laju: 40% terpakai di seperlima masa aktif -> kritis', () => {
  // Elapsed 2 hari dari 10 hari = 1/5 masa aktif.
  const s = computeQuota(pkg(), 4 * GB, t(2026, 10, 12, 0));
  assert.equal(s.status, 'kritis');
  assert.match(statusLabel(s.status), /kritis/);
});

test('status laju: laju 1,2 -> mepet', () => {
  // Elapsed 5 hari (1/2 waktu), terpakai 6 GB (60%) -> laju 1,2.
  const s = computeQuota(pkg(), 6 * GB, t(2026, 10, 15, 0));
  assert.equal(s.status, 'mepet');
});

// --- computeQuota: anggaran aman harian (T2.4) -------------------------------

test('anggaran aman: sisa kuota / sisa hari fraksional', () => {
  // Sisa 8 GB, sisa masa aktif 8 hari -> tepat 1 GB/hari.
  const s = computeQuota(pkg(), 2 * GB, t(2026, 10, 12, 0));
  assert.equal(s.safeDailyBudgetBytes, 1 * GB);
});

// --- forecast: rata-rata berbobot + rentang ---------------------------------

test('prediksi berbobot: tiga hari terakhir berbobot 2', () => {
  // Hari penuh lama -> baru: 1, 2, 3, 4, 10 GB.
  // Bobot: [1, 1, 2, 2, 2] -> (1+2+6+8+20)/8 = 4,625 GB/hari.
  const f = computeForecast(9.25 * GB, [1, 2, 3, 4, 10].map((v) => v * GB), t(2026, 10, 16, 12));
  assert.equal(f.hasEnoughData, true);
  assert.equal(f.fullDaysCount, 5);
  assert.equal(f.weightedAvgBytes, 4.625 * GB);
  // Proyeksi: 9,25 / 4,625 = tepat 2 hari dari now.
  assert.equal(f.projectedRunOut?.getTime(), t(2026, 10, 16, 12).getTime() + 2 * DAY);
  // Rentang: P25 = 2 GB -> 4,625 hari; P75 = 4 GB -> 2,3125 hari.
  assert.equal(f.hematDate?.getTime(), t(2026, 10, 16, 12).getTime() + 4.625 * DAY);
  assert.equal(f.borosDate?.getTime(), t(2026, 10, 16, 12).getTime() + 2.3125 * DAY);
  assert.ok((f.hematDate?.getTime() ?? 0) > (f.borosDate?.getTime() ?? 0));
});

test('prediksi berbobot: kasus lonjakan satu hari', () => {
  // Satu hari melonjak 10 GB di antara hari-hari 1 GB.
  // Bobot [1, 2, 2, 2] -> (1+2+2+20)/7 = 25/7 GB/hari.
  const f = computeForecast(5 * GB, [1, 1, 1, 10].map((v) => v * GB), t(2026, 10, 16, 12));
  assert.ok(Math.abs(f.weightedAvgBytes - (25 / 7) * GB) < 1);
  // Proyeksi: 5 / (25/7) = 1,4 hari dari now.
  assert.ok(
    Math.abs((f.projectedRunOut?.getTime() ?? 0) - (t(2026, 10, 16, 12).getTime() + 1.4 * DAY)) <
      1000,
  );
});

test('prediksi berbobot: tanpa hari penuh, tidak ada angka', () => {
  const f = computeForecast(5 * GB, [], t(2026, 10, 16, 12));
  assert.equal(f.hasEnoughData, false);
  assert.equal(f.projectedRunOut, null);
  assert.equal(f.hematDate, null);
  assert.equal(f.borosDate, null);
});

test('prediksi berbobot: sisa kuota nol -> tanpa proyeksi', () => {
  const f = computeForecast(0, [1 * GB, 2 * GB], t(2026, 10, 16, 12));
  assert.equal(f.hasEnoughData, false);
  assert.equal(f.projectedRunOut, null);
});

// --- fullDayBytesForPackage: penyaringan jendela -----------------------------

test('fullDayBytesForPackage: hanya hari penuh dalam jendela paket', () => {
  const buckets = [
    { dateISO: '2026-10-09', mobileBytes: 9 * GB }, // sebelum paket mulai
    { dateISO: '2026-10-10', mobileBytes: 1 * GB },
    { dateISO: '2026-10-11', mobileBytes: 2 * GB },
    { dateISO: '2026-10-12', mobileBytes: 3 * GB }, // hari ini — parsial
  ];
  const hariPenuh = fullDayBytesForPackage(buckets, pkg(), t(2026, 10, 12, 12));
  assert.deepEqual(hariPenuh, [1 * GB, 2 * GB]);
});

// --- helper tanggal paket (T2.7) ----------------------------------------------

test('packageLastDay: sehari sebelum tanggal reset', () => {
  // Mulai 16 Okt, 5 hari -> reset 21 Okt, hari terakhir 20 Okt.
  const last = packageLastDay(pkg({ startDate: '2026-10-16', durationDays: 5 }));
  assert.equal(last.getFullYear(), 2026);
  assert.equal(last.getMonth(), 9);
  assert.equal(last.getDate(), 20);
});

test('durationDaysFromEndDate: inklusif, hari sama = 1', () => {
  assert.equal(durationDaysFromEndDate('2026-10-16', '2026-10-20'), 5);
  assert.equal(durationDaysFromEndDate('2026-10-16', '2026-10-16'), 1);
});

// --- spike: aturan lonjakan harian --------------------------------------------

test('lonjakan harian: sebelum tengah hari, 5 GB vs median 1 GB -> temuan berangka', () => {
  const temuan = detectSpikes({
    todayMobileBytes: 5 * GB,
    previousFullDaysMobileBytes: [1, 1, 1, 1, 1, 1, 1].map((v) => v * GB),
    perAppToday: [],
    now: t(2026, 10, 17, 9),
  });
  assert.equal(temuan.length, 1);
  assert.equal(temuan[0].kind, 'lonjakan-harian');
  assert.equal(temuan[0].medianBytes, 1 * GB);
  assert.equal(temuan[0].todayMobileBytes, 5 * GB);
  // Detail wajib memuat angka penyebabnya.
  assert.match(temuan[0].detail, /5/);
  assert.match(temuan[0].detail, /2x/);
});

test('lonjakan harian: sesudah tengah hari tidak memicu aturan 1', () => {
  const temuan = detectSpikes({
    todayMobileBytes: 5 * GB,
    previousFullDaysMobileBytes: [1, 1, 1, 1, 1, 1, 1].map((v) => v * GB),
    perAppToday: [],
    now: t(2026, 10, 17, 13),
  });
  assert.deepEqual(temuan, []);
});

test('lonjakan harian: kurang dari 3 hari sebelumnya -> tidak memicu', () => {
  const temuan = detectSpikes({
    todayMobileBytes: 5 * GB,
    previousFullDaysMobileBytes: [1 * GB, 1 * GB],
    perAppToday: [],
    now: t(2026, 10, 17, 9),
  });
  assert.deepEqual(temuan, []);
});

test('lonjakan harian: median nol -> tidak memicu', () => {
  const temuan = detectSpikes({
    todayMobileBytes: 5 * GB,
    previousFullDaysMobileBytes: [0, 0, 0, 0],
    perAppToday: [],
    now: t(2026, 10, 17, 9),
  });
  assert.deepEqual(temuan, []);
});

// --- spike: aturan aplikasi dominan -------------------------------------------

test('aplikasi dominan: satu aplikasi > 50% hari ini -> temuan berangka', () => {
  const temuan = detectSpikes({
    todayMobileBytes: 9 * GB,
    previousFullDaysMobileBytes: [1 * GB, 1 * GB, 1 * GB],
    perAppToday: [
      { packageName: 'com.contoh.a', label: 'Aplikasi A', bytes: 6 * GB },
      { packageName: 'com.contoh.b', label: 'Aplikasi B', bytes: 2 * GB },
      { packageName: 'com.contoh.c', label: 'Aplikasi C', bytes: 1 * GB },
    ],
    now: t(2026, 10, 17, 9),
  });
  const dominan = temuan.filter((x) => x.kind === 'aplikasi-dominan');
  assert.equal(dominan.length, 1);
  assert.equal(dominan[0].appLabel, 'Aplikasi A');
  assert.equal(dominan[0].appBytes, 6 * GB);
  assert.ok(Math.abs((dominan[0].appSharePercent ?? 0) - 66.666666) < 0.001);
  assert.match(dominan[0].detail, /Aplikasi A/);
});

test('aplikasi dominan: tepat 50% tidak memicu (harus LEBIH dari separuh)', () => {
  const temuan = detectSpikes({
    todayMobileBytes: 10 * GB,
    previousFullDaysMobileBytes: [1 * GB, 1 * GB, 1 * GB],
    perAppToday: [
      { packageName: 'com.contoh.a', label: 'Aplikasi A', bytes: 5 * GB },
      { packageName: 'com.contoh.b', label: 'Aplikasi B', bytes: 5 * GB },
    ],
    now: t(2026, 10, 17, 13),
  });
  assert.deepEqual(temuan, []);
});

// --- spike: median --------------------------------------------------------------

test('median: genap dirata-rata, ganjil nilai tengah', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([]), 0);
});

// --- buckets: merge ----------------------------------------------------------------

test('mergeDailyBuckets: segar menimpa, lama dipertahankan, terurut', () => {
  const gabungan = mergeDailyBuckets(
    [
      { dateISO: '2026-10-10', mobileBytes: 1, wifiBytes: 0 },
      { dateISO: '2026-10-11', mobileBytes: 1, wifiBytes: 0 },
    ],
    [
      { dateISO: '2026-10-11', mobileBytes: 2, wifiBytes: 3 },
      { dateISO: '2026-10-12', mobileBytes: 4, wifiBytes: 0 },
    ],
  );
  assert.deepEqual(gabungan, [
    { dateISO: '2026-10-10', mobileBytes: 1, wifiBytes: 0 },
    { dateISO: '2026-10-11', mobileBytes: 2, wifiBytes: 3 },
    { dateISO: '2026-10-12', mobileBytes: 4, wifiBytes: 0 },
  ]);
});

test('mergeDailyBuckets: entri rusak disaring', () => {
  const gabungan = mergeDailyBuckets(
    [],
    [
      { dateISO: '2026-10-11', mobileBytes: -1, wifiBytes: 0 },
      { dateISO: 'bukan-tanggal', mobileBytes: 1, wifiBytes: 0 },
      { dateISO: '2026-10-12', mobileBytes: 1, wifiBytes: 0 },
    ],
  );
  assert.deepEqual(gabungan, [{ dateISO: '2026-10-12', mobileBytes: 1, wifiBytes: 0 }]);
});

test('mergeDailyAppBuckets: kunci nama paket + tanggal', () => {
  const gabungan = mergeDailyAppBuckets(
    [{ packageName: 'a', label: 'A', dateISO: '2026-10-11', bytes: 1 }],
    [
      { packageName: 'a', label: 'A', dateISO: '2026-10-11', bytes: 5 },
      { packageName: 'a', label: 'A', dateISO: '2026-10-12', bytes: 2 },
    ],
  );
  // Entri lama tanpa bidang pecah dinormalisasi (T3.3): seluruhnya seluler.
  assert.deepEqual(gabungan, [
    { packageName: 'a', label: 'A', dateISO: '2026-10-11', bytes: 5, mobileBytes: 5, wifiBytes: 0 },
    { packageName: 'a', label: 'A', dateISO: '2026-10-12', bytes: 2, mobileBytes: 2, wifiBytes: 0 },
  ]);
});

test('sampleDailyBuckets: 7 hari, hari ini parsial', () => {
  const buckets = sampleDailyBuckets(t(2026, 10, 17, 12));
  assert.equal(buckets.length, 7);
  assert.equal(buckets[6].dateISO, '2026-10-17');
  assert.equal(buckets[6].mobileBytes, 3 * GB);
  assert.equal(buckets[0].mobileBytes, 6 * GB);
});
