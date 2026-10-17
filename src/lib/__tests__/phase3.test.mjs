// Uji unit logika Fase 3 (T3.2 + T3.3 + T3.4) — node:test + node:assert,
// tanpa dependensi React Native / modul native. Impor memakai ekstensi
// .ts eksplisit (Node 24 type stripping), seperti phase2.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateDailyAppBuckets,
  compareWithPrevious,
  filterApps,
  normalisasiAppUsage,
  reconcileAppUsage,
  sortApps,
  SYSTEM_ROW_LABEL,
  SYSTEM_ROW_PACKAGE,
  sumAppUsage,
} from '../appUsage.ts';
import { detectSpikes } from '../spike.ts';

const GB = 1024 ** 3;

const app = (over = {}) => ({
  packageName: 'com.contoh.a',
  label: 'Aplikasi A',
  bytes: 0,
  mobileBytes: 0,
  wifiBytes: 0,
  ...over,
});

// --- reconcileAppUsage ------------------------------------------------------

test('rekonsiliasi: selisih menjadi baris Sistem dan lainnya, jumlah = total perangkat', () => {
  const hasil = reconcileAppUsage(10 * GB, 4 * GB, [
    app({ packageName: 'a', label: 'A', mobileBytes: 6 * GB, wifiBytes: 1 * GB, bytes: 7 * GB }),
    app({ packageName: 'b', label: 'B', mobileBytes: 2 * GB, wifiBytes: 1 * GB, bytes: 3 * GB }),
  ]);
  const sistem = hasil.find((a) => a.packageName === SYSTEM_ROW_PACKAGE);
  assert.ok(sistem);
  assert.equal(sistem.label, SYSTEM_ROW_LABEL);
  assert.equal(sistem.mobileBytes, 2 * GB);
  assert.equal(sistem.wifiBytes, 2 * GB);
  assert.deepEqual(sumAppUsage(hasil), { mobileBytes: 10 * GB, wifiBytes: 4 * GB, totalBytes: 14 * GB });
});

test('rekonsiliasi: tanpa selisih, tanpa baris sistem', () => {
  const hasil = reconcileAppUsage(8 * GB, 2 * GB, [
    app({ packageName: 'a', label: 'A', mobileBytes: 8 * GB, wifiBytes: 2 * GB, bytes: 10 * GB }),
  ]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].packageName, 'a');
});

test('rekonsiliasi: jumlah melebihi total perangkat diskalakan proporsional', () => {
  // Data lama pra-T3.3 yang menggandakan UID bersama: jumlah 20 GB
  // padahal perangkat 10 GB — diskalakan ke 10 GB, tanpa baris sistem.
  const hasil = reconcileAppUsage(10 * GB, 0, [
    app({ packageName: 'a', label: 'A', mobileBytes: 12 * GB, wifiBytes: 0, bytes: 12 * GB }),
    app({ packageName: 'b', label: 'B', mobileBytes: 8 * GB, wifiBytes: 0, bytes: 8 * GB }),
  ]);
  assert.deepEqual(sumAppUsage(hasil), { mobileBytes: 10 * GB, wifiBytes: 0, totalBytes: 10 * GB });
  assert.equal(hasil.find((a) => a.packageName === SYSTEM_ROW_PACKAGE), undefined);
  // Proporsi dipertahankan: A 60%, B 40%.
  assert.equal(hasil.find((a) => a.packageName === 'a').mobileBytes, 6 * GB);
  assert.equal(hasil.find((a) => a.packageName === 'b').mobileBytes, 4 * GB);
});

test('rekonsiliasi: baris sistem lama tidak digandakan', () => {
  const hasil = reconcileAppUsage(10 * GB, 0, [
    app({ packageName: SYSTEM_ROW_PACKAGE, label: SYSTEM_ROW_LABEL, mobileBytes: 3 * GB, bytes: 3 * GB }),
    app({ packageName: 'a', label: 'A', mobileBytes: 7 * GB, bytes: 7 * GB }),
  ]);
  assert.equal(hasil.filter((a) => a.packageName === SYSTEM_ROW_PACKAGE).length, 1);
  assert.equal(hasil.find((a) => a.packageName === SYSTEM_ROW_PACKAGE).mobileBytes, 3 * GB);
});

// --- normalisasiAppUsage ------------------------------------------------------

test('normalisasi: data lama hanya bytes dibaca seluruhnya sebagai seluler', () => {
  const hasil = normalisasiAppUsage({ packageName: 'a', label: 'A', bytes: 5 * GB });
  assert.deepEqual(hasil, {
    packageName: 'a',
    label: 'A',
    bytes: 5 * GB,
    mobileBytes: 5 * GB,
    wifiBytes: 0,
  });
});

test('normalisasi: data terpecah dipertahankan, bytes = jumlah pecahan', () => {
  const hasil = normalisasiAppUsage({
    packageName: 'a',
    label: 'A',
    bytes: 999,
    mobileBytes: 3 * GB,
    wifiBytes: 2 * GB,
  });
  assert.equal(hasil.bytes, 5 * GB);
  assert.equal(hasil.mobileBytes, 3 * GB);
  assert.equal(hasil.wifiBytes, 2 * GB);
});

// --- sortApps / filterApps (T3.2) ---------------------------------------------

test('urut: seluler menurun, Wi-Fi menurun, nama menaik', () => {
  const daftar = [
    app({ packageName: 'a', label: 'Zebra', mobileBytes: 1 * GB, wifiBytes: 9 * GB }),
    app({ packageName: 'b', label: 'apel', mobileBytes: 5 * GB, wifiBytes: 1 * GB }),
    app({ packageName: 'c', label: 'Mangga', mobileBytes: 3 * GB, wifiBytes: 5 * GB }),
  ];
  assert.deepEqual(sortApps(daftar, 'mobile').map((a) => a.packageName), ['b', 'c', 'a']);
  assert.deepEqual(sortApps(daftar, 'wifi').map((a) => a.packageName), ['a', 'c', 'b']);
  assert.deepEqual(sortApps(daftar, 'name').map((a) => a.packageName), ['b', 'c', 'a']);
});

test('cari: cocok label atau nama paket, tidak peka huruf', () => {
  const daftar = [
    app({ packageName: 'com.google.android.youtube', label: 'YouTube' }),
    app({ packageName: 'com.instagram.android', label: 'Instagram' }),
  ];
  assert.equal(filterApps(daftar, 'tube').length, 1);
  assert.equal(filterApps(daftar, 'INSTAGRAM').length, 1);
  assert.equal(filterApps(daftar, 'com.google').length, 1);
  assert.equal(filterApps(daftar, '  ').length, 2);
  assert.equal(filterApps(daftar, 'tidak-ada').length, 0);
});

// --- aggregateDailyAppBuckets (T3.4) ------------------------------------------

test('agregasi harian: jumlah per tanggal, urut naik, aplikasi lain diabaikan', () => {
  const buckets = [
    { packageName: 'a', label: 'A', dateISO: '2026-10-12', bytes: 3 * GB, mobileBytes: 2 * GB, wifiBytes: 1 * GB },
    { packageName: 'a', label: 'A', dateISO: '2026-10-11', bytes: 1 * GB, mobileBytes: 1 * GB, wifiBytes: 0 },
    { packageName: 'a', label: 'A', dateISO: '2026-10-12', bytes: 2 * GB, mobileBytes: 2 * GB, wifiBytes: 0 },
    { packageName: 'b', label: 'B', dateISO: '2026-10-12', bytes: 9 * GB, mobileBytes: 9 * GB, wifiBytes: 0 },
  ];
  assert.deepEqual(aggregateDailyAppBuckets(buckets, 'a'), [
    { dateISO: '2026-10-11', mobileBytes: 1 * GB, wifiBytes: 0 },
    { dateISO: '2026-10-12', mobileBytes: 4 * GB, wifiBytes: 1 * GB },
  ]);
});

// --- compareWithPrevious (T3.4) -----------------------------------------------

test('perbandingan: delta, persen, arah', () => {
  assert.deepEqual(compareWithPrevious(150, 100), {
    deltaBytes: 50,
    deltaPercent: 50,
    naik: true,
  });
  assert.deepEqual(compareWithPrevious(50, 100), {
    deltaBytes: -50,
    deltaPercent: -50,
    naik: false,
  });
  assert.deepEqual(compareWithPrevious(100, 100), {
    deltaBytes: 0,
    deltaPercent: 0,
    naik: null,
  });
});

test('perbandingan: periode sebelumnya nol -> persen null', () => {
  assert.deepEqual(compareWithPrevious(100, 0), {
    deltaBytes: 100,
    deltaPercent: null,
    naik: true,
  });
  assert.deepEqual(compareWithPrevious(0, 0), {
    deltaBytes: 0,
    deltaPercent: null,
    naik: null,
  });
});

// --- spike: aturan dominan memakai seluler (T3.3) -----------------------------

test('lonjakan: aplikasi boros Wi-Fi tapi hemat seluler TIDAK dominan', () => {
  const t = (y, m, d, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0);
  const temuan = detectSpikes({
    todayMobileBytes: 10 * GB,
    previousFullDaysMobileBytes: [1 * GB, 1 * GB, 1 * GB],
    perAppToday: [
      { packageName: 'a', label: 'Aplikasi A', bytes: 90 * GB, mobileBytes: 2 * GB },
      { packageName: 'b', label: 'Aplikasi B', bytes: 4 * GB, mobileBytes: 4 * GB },
      { packageName: 'c', label: 'Aplikasi C', bytes: 4 * GB, mobileBytes: 4 * GB },
    ],
    now: t(2026, 10, 17, 13),
  });
  // Gabungan A (90 GB) akan memicu bila memakai bytes; seluler A hanya 2/10
  // dan tidak ada aplikasi yang melewati 50% seluler (maks 40%).
  assert.deepEqual(temuan, []);
});

test('lonjakan: aplikasi dominan seluler tetap memicu', () => {
  const t = (y, m, d, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0);
  const temuan = detectSpikes({
    todayMobileBytes: 10 * GB,
    previousFullDaysMobileBytes: [1 * GB, 1 * GB, 1 * GB],
    perAppToday: [
      { packageName: 'a', label: 'Aplikasi A', bytes: 6 * GB, mobileBytes: 6 * GB },
      { packageName: 'b', label: 'Aplikasi B', bytes: 4 * GB, mobileBytes: 4 * GB },
    ],
    now: t(2026, 10, 17, 13),
  });
  assert.equal(temuan.length, 1);
  assert.equal(temuan[0].kind, 'aplikasi-dominan');
  assert.equal(temuan[0].appBytes, 6 * GB);
});
