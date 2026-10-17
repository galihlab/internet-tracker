// Uji unit snapshot ringkasan (T3.6, penutup jalur ringkasan) —
// node:test + node:assert, tanpa dependensi React Native / modul native.
// Yang diuji: lapisan snapshot murni di summarySnapshots.ts (kunci
// jendela stabil, simpan/muat, tolak data contoh, timpa, prune).
// Pengkabelan ke query native di usageStats.ts memakai helper yang
// sama; tidak diuji di Node karena perlu AsyncStorage + modul native.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUMMARY_SNAPSHOTS_KEY,
  emptySummary,
  loadSummarySnapshot,
  loadSummarySnapshots,
  pruneSummarySnapshots,
  saveSummarySnapshot,
  snapshotToSummary,
  summaryWindowKey,
} from '../summarySnapshots.ts';

// Tanggal lokal eksplisit supaya uji tidak bergantung zona waktu mesin.
const t = (y, m, d, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();
const HARI = 24 * 60 * 60 * 1000;

function tokoBaru(isi = {}) {
  const data = { ...isi };
  return {
    getItem: async (k) => (k in data ? data[k] : null),
    setItem: async (k, v) => {
      data[k] = v;
    },
    _data: data,
  };
}

function ringkasan(over = {}) {
  return {
    wifiBytes: 100,
    mobileBytes: 200,
    totalBytes: 300,
    periodStart: 1000,
    periodEnd: 2000,
    perApp: [
      {
        packageName: 'com.contoh.a',
        label: 'Aplikasi A',
        bytes: 300,
        mobileBytes: 200,
        wifiBytes: 100,
      },
    ],
    source: 'native',
    fromSnapshot: false,
    updatedAt: 0,
    ...over,
  };
}

// --- kunci jendela ----------------------------------------------------------

test('kunci: jendela terbuka stabil walau end berubah tiap detik', () => {
  const mulai = t(2026, 10, 17, 0);
  const kunci1 = summaryWindowKey(mulai, t(2026, 10, 17, 10, 0, 0), t(2026, 10, 17, 10, 0, 5));
  const kunci2 = summaryWindowKey(mulai, t(2026, 10, 17, 10, 0, 30), t(2026, 10, 17, 10, 0, 35));
  assert.equal(kunci1, kunci2);
  assert.equal(kunci1, 'terbuka:2026-10-17');
});

test('kunci: tanggal mulai berbeda -> kunci berbeda', () => {
  const sekarang = t(2026, 10, 17, 10);
  assert.notEqual(
    summaryWindowKey(t(2026, 10, 17, 0), sekarang, sekarang),
    summaryWindowKey(t(2026, 10, 16, 0), sekarang, sekarang),
  );
});

test('kunci: jendela tertutup (end tengah malam) berbeda dari terbuka', () => {
  const sekarang = t(2026, 10, 17, 10);
  const tertutup = summaryWindowKey(t(2026, 10, 10, 0), t(2026, 10, 17, 0), sekarang);
  const terbuka = summaryWindowKey(t(2026, 10, 10, 0), sekarang, sekarang);
  assert.equal(tertutup, 'tertutup:2026-10-10:2026-10-17');
  assert.equal(terbuka, 'terbuka:2026-10-10');
  assert.notEqual(tertutup, terbuka);
  // Jendela tertutup yang sama stabil.
  assert.equal(summaryWindowKey(t(2026, 10, 10, 0), t(2026, 10, 17, 0), sekarang), tertutup);
});

test('kunci: jendela parsial (kemarin pada jam yang sama) stabil per tanggal akhir', () => {
  const sekarang = t(2026, 10, 17, 10);
  const kunci = summaryWindowKey(t(2026, 10, 16, 0), t(2026, 10, 16, 5), sekarang);
  assert.equal(kunci, 'parsial:2026-10-16:2026-10-16');
  assert.equal(summaryWindowKey(t(2026, 10, 16, 0), t(2026, 10, 16, 6), sekarang), kunci);
});

// --- simpan / muat ----------------------------------------------------------

test('snapshot: simpan lalu muat kembali (cache hit)', async () => {
  const toko = tokoBaru();
  const sekarang = t(2026, 10, 17, 10);
  await saveSummarySnapshot(toko, 'terbuka:2026-10-10', ringkasan({ mobileBytes: 500 }), sekarang);
  const muat = await loadSummarySnapshot(toko, 'terbuka:2026-10-10');
  assert.ok(muat);
  assert.equal(muat.summary.mobileBytes, 500);
  assert.equal(muat.updatedAt, sekarang);
  // Konversi ke tampilan: sumber snapshot + cap waktu dipertahankan.
  const tampil = snapshotToSummary(muat);
  assert.equal(tampil.source, 'snapshot');
  assert.equal(tampil.fromSnapshot, true);
  assert.equal(tampil.updatedAt, sekarang);
  assert.equal(tampil.mobileBytes, 500);
});

test('snapshot: cache miss -> null (pemanggil memakai fallback jujur)', async () => {
  const toko = tokoBaru();
  assert.equal(await loadSummarySnapshot(toko, 'terbuka:2026-10-10'), null);
  assert.deepEqual(await loadSummarySnapshots(toko), {});
  // Fallback jujur: nol, sumber 'empty' — bukan data contoh.
  const kosong = emptySummary(1000, 2000, t(2026, 10, 17, 10));
  assert.deepEqual(kosong, {
    wifiBytes: 0,
    mobileBytes: 0,
    totalBytes: 0,
    periodStart: 1000,
    periodEnd: 2000,
    perApp: [],
    source: 'empty',
    fromSnapshot: false,
    updatedAt: t(2026, 10, 17, 10),
  });
});

test('snapshot: baru menimpa yang lama pada kunci yang sama', async () => {
  const toko = tokoBaru();
  const kunci = 'terbuka:2026-10-10';
  await saveSummarySnapshot(toko, kunci, ringkasan({ mobileBytes: 100 }), t(2026, 10, 17, 9));
  await saveSummarySnapshot(toko, kunci, ringkasan({ mobileBytes: 900 }), t(2026, 10, 17, 10));
  const muat = await loadSummarySnapshot(toko, kunci);
  assert.equal(muat.summary.mobileBytes, 900);
  assert.equal(muat.updatedAt, t(2026, 10, 17, 10));
});

// --- data contoh tidak pernah disimpan --------------------------------------

test('snapshot: data contoh tidak pernah disimpan (sample/snapshot/empty ditolak)', async () => {
  const toko = tokoBaru();
  const sekarang = t(2026, 10, 17, 10);
  for (const sumber of ['sample', 'snapshot', 'empty']) {
    await saveSummarySnapshot(toko, `terbuka:2026-10-10`, ringkasan({ source: sumber }), sekarang);
  }
  assert.equal(await loadSummarySnapshot(toko, 'terbuka:2026-10-10'), null);
  assert.equal(toko._data[SUMMARY_SNAPSHOTS_KEY], undefined);
});

test('snapshot: entri contoh di blob lama ditolak saat muat (defense in depth)', async () => {
  const toko = tokoBaru({
    [SUMMARY_SNAPSHOTS_KEY]: JSON.stringify({
      'terbuka:2026-10-10': { updatedAt: 1, summary: ringkasan({ source: 'sample' }) },
    }),
  });
  assert.equal(await loadSummarySnapshot(toko, 'terbuka:2026-10-10'), null);
});

// --- validasi / prune ---------------------------------------------------------

test('snapshot: JSON rusak -> peta kosong, bukan crash', async () => {
  const toko = tokoBaru({ [SUMMARY_SNAPSHOTS_KEY]: 'bukan-json{{{' });
  assert.deepEqual(await loadSummarySnapshots(toko), {});
});

test('snapshot: entri per aplikasi rusak dibuang, yang baik dipertahankan', async () => {
  const toko = tokoBaru();
  const sekarang = t(2026, 10, 17, 10);
  await toko.setItem(
    SUMMARY_SNAPSHOTS_KEY,
    JSON.stringify({
      'terbuka:2026-10-10': {
        updatedAt: sekarang,
        summary: ringkasan({
          perApp: [
            { packageName: 'a', label: 'A', bytes: 10, mobileBytes: 10, wifiBytes: 0 },
            { packageName: 'rusak', label: 'Rusak', bytes: -5, mobileBytes: -5, wifiBytes: 0 },
            { packageName: 123, label: 'TanpaNama' },
          ],
        }),
      },
    }),
  );
  const muat = await loadSummarySnapshot(toko, 'terbuka:2026-10-10');
  assert.deepEqual(
    muat.summary.perApp.map((a) => a.packageName),
    ['a'],
  );
});

test('snapshot: entri kedaluwarsa (>90 hari) dibuang saat simpan', async () => {
  const sekarang = t(2026, 10, 17, 10);
  const toko = tokoBaru({
    [SUMMARY_SNAPSHOTS_KEY]: JSON.stringify({
      'terbuka:2026-01-01': {
        updatedAt: sekarang - 100 * HARI,
        summary: ringkasan({ mobileBytes: 111 }),
      },
    }),
  });
  await saveSummarySnapshot(toko, 'terbuka:2026-10-10', ringkasan({ mobileBytes: 222 }), sekarang);
  assert.equal(await loadSummarySnapshot(toko, 'terbuka:2026-01-01'), null);
  assert.equal((await loadSummarySnapshot(toko, 'terbuka:2026-10-10')).summary.mobileBytes, 222);
});

test('snapshot: prune mempertahankan entri terbaru saat melebihi batas', () => {
  const sekarang = t(2026, 10, 17, 10);
  const semua = {};
  for (let i = 0; i < 205; i += 1) {
    semua[`k${i}`] = { updatedAt: sekarang - i * 1000, summary: ringkasan() };
  }
  const hasil = pruneSummarySnapshots(semua, sekarang);
  assert.equal(Object.keys(hasil).length, 200);
  // Entri tertua (k204) terbuang, terbaru (k0) dipertahankan.
  assert.ok(hasil.k0);
  assert.equal(hasil.k204, undefined);
});

test('snapshot: konversi mempertahankan rentang snapshot, bukan rentang yang diminta', () => {
  const muat = {
    updatedAt: t(2026, 10, 17, 9),
    summary: ringkasan({ periodStart: t(2026, 10, 10, 0), periodEnd: t(2026, 10, 17, 9) }),
  };
  const tampil = snapshotToSummary(muat);
  assert.equal(tampil.periodEnd, t(2026, 10, 17, 9));
  assert.equal(tampil.periodStart, t(2026, 10, 10, 0));
});
