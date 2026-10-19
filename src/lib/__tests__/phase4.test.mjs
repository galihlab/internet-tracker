// Uji unit notifikasi Fase 4 (T4.2) — node:test + node:assert, tanpa
// dependensi React Native / Expo / modul native. Yang diuji: detektor
// murni di notifications.ts (ambang, prediksi kritis, ringkasan
// harian) dan penyimpanan state di notificationState.ts (dedup,
// reset per paket baru). Pengiriman expo-notifications dan tugas latar
// tidak diuji di Node — perlu perangkat.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dailySummaryContent,
  detectCriticalForecast,
  detectThresholdCrossings,
  packageSignature,
  shouldSendDailySummary,
} from '../notifications.ts';
import {
  claimFiredKey,
  loadNotificationState,
  markDailySummarySent,
  resetNotificationState,
} from '../notificationState.ts';

// Tanggal lokal eksplisit supaya uji tidak bergantung zona waktu mesin.
const t = (y, m, d, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s);
const GB = 1024 ** 3;

const paket = () => ({
  name: 'Kuota Utama',
  quotaBytes: 10 * GB,
  startDate: '2026-10-10',
  durationDays: 10,
  operator: 'Telkomsel',
  network: '4G/5G',
});

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

// --- signature paket ---------------------------------------------------------

test('signature: nama/operator/jaringan tidak mengubah signature (edit label tidak bunyi ulang)', () => {
  const a = paket();
  const b = { ...a, name: 'Paket Baru', operator: 'XL', network: '5G' };
  assert.equal(packageSignature(a), packageSignature(b));
});

test('signature: kuota/tanggal mulai/durasi mengubah signature', () => {
  const a = paket();
  assert.notEqual(packageSignature(a), packageSignature({ ...a, quotaBytes: 20 * GB }));
  assert.notEqual(packageSignature(a), packageSignature({ ...a, startDate: '2026-10-11' }));
  assert.notEqual(packageSignature(a), packageSignature({ ...a, durationDays: 5 }));
});

// --- ambang ------------------------------------------------------------------

test('ambang: di bawah ambang terendah -> tidak ada temuan', () => {
  const temuan = detectThresholdCrossings({
    usedPercent: 45,
    enabledThresholds: [50, 80, 100],
    firedIds: [],
    pkg: paket(),
    usedBytes: 4.5 * GB,
    remainingBytes: 5.5 * GB,
    now: t(2026, 10, 12, 10),
  });
  assert.deepEqual(temuan, []);
});

test('ambang: melewati satu ambang -> tepat satu temuan berangka', () => {
  const temuan = detectThresholdCrossings({
    usedPercent: 55,
    enabledThresholds: [50, 80, 100],
    firedIds: [],
    pkg: paket(),
    usedBytes: 5.5 * GB,
    remainingBytes: 4.5 * GB,
    now: t(2026, 10, 12, 10),
  });
  assert.equal(temuan.length, 1);
  assert.equal(temuan[0].kind, 'ambang-kuota');
  assert.equal(temuan[0].thresholdPercent, 50);
  // Detail wajib berangka (dipakai + sisa + total).
  assert.match(temuan[0].detail, /5\.5 GB/);
  assert.match(temuan[0].detail, /4\.5 GB/);
  assert.match(temuan[0].detail, /10\.0 GB/);
  assert.equal(temuan[0].dateISO, '2026-10-12');
});

test('ambang: melompat dua ambang sekaligus -> kedua ambang dilaporkan (masing-masing sekali)', () => {
  const temuan = detectThresholdCrossings({
    usedPercent: 85,
    enabledThresholds: [50, 80, 100],
    firedIds: [],
    pkg: paket(),
    usedBytes: 8.5 * GB,
    remainingBytes: 1.5 * GB,
    now: t(2026, 10, 12, 10),
  });
  assert.deepEqual(
    temuan.map((x) => x.thresholdPercent),
    [50, 80],
  );
});

test('ambang: yang sudah berbunyi dilewati (sekali per paket)', () => {
  const p = paket();
  const pertama = detectThresholdCrossings({
    usedPercent: 85,
    enabledThresholds: [50, 80, 100],
    firedIds: [],
    pkg: p,
    usedBytes: 8.5 * GB,
    remainingBytes: 1.5 * GB,
    now: t(2026, 10, 12, 10),
  });
  const sudah = pertama.map((x) => x.dedupKey);
  const kedua = detectThresholdCrossings({
    usedPercent: 85,
    enabledThresholds: [50, 80, 100],
    firedIds: sudah,
    pkg: p,
    usedBytes: 8.5 * GB,
    remainingBytes: 1.5 * GB,
    now: t(2026, 10, 12, 11),
  });
  assert.deepEqual(kedua, []);
});

test('ambang: ambang yang dimatikan tidak berbunyi; ambang di luar 50/80/100 diabaikan', () => {
  const temuan = detectThresholdCrossings({
    usedPercent: 90,
    enabledThresholds: [80, 70],
    firedIds: [],
    pkg: paket(),
    usedBytes: 9 * GB,
    remainingBytes: 1 * GB,
    now: t(2026, 10, 12, 10),
  });
  assert.deepEqual(
    temuan.map((x) => x.thresholdPercent),
    [80],
  );
});

test('ambang: daftar aktif kosong -> tidak ada temuan', () => {
  const temuan = detectThresholdCrossings({
    usedPercent: 100,
    enabledThresholds: [],
    firedIds: [],
    pkg: paket(),
    usedBytes: 10 * GB,
    remainingBytes: 0,
    now: t(2026, 10, 12, 10),
  });
  assert.deepEqual(temuan, []);
});

// --- prediksi kritis -----------------------------------------------------------

function ramalan(over = {}) {
  return {
    hasEnoughData: true,
    fullDaysCount: 3,
    weightedAvgBytes: 2 * GB,
    projectedRunOut: t(2026, 10, 15, 10),
    hematDate: t(2026, 10, 17, 10),
    borosDate: t(2026, 10, 14, 10),
    ...over,
  };
}

test('prediksi kritis: proyeksi sebelum akhir masa aktif -> satu pengingat berangka', () => {
  const temuan = detectCriticalForecast({
    forecast: ramalan(),
    packageEnd: t(2026, 10, 20, 0),
    remainingBytes: 5 * GB,
    firedIds: [],
    pkg: paket(),
    now: t(2026, 10, 12, 10),
  });
  assert.ok(temuan);
  assert.equal(temuan.kind, 'prediksi-kritis');
  assert.match(temuan.detail, /2\.0 GB/);
  assert.match(temuan.detail, /5\.0 GB/);
});

test('prediksi kritis: proyeksi melewati akhir masa aktif -> tidak ada pengingat', () => {
  assert.equal(
    detectCriticalForecast({
      forecast: ramalan({ projectedRunOut: t(2026, 10, 25, 10) }),
      packageEnd: t(2026, 10, 20, 0),
      remainingBytes: 5 * GB,
      firedIds: [],
      pkg: paket(),
      now: t(2026, 10, 12, 10),
    }),
    null,
  );
});

test('prediksi kritis: kuota habis / belum cukup data / proyeksi null / masa aktif berakhir -> null', () => {
  const dasar = {
    forecast: ramalan(),
    packageEnd: t(2026, 10, 20, 0),
    remainingBytes: 5 * GB,
    firedIds: [],
    pkg: paket(),
    now: t(2026, 10, 12, 10),
  };
  assert.equal(detectCriticalForecast({ ...dasar, remainingBytes: 0 }), null);
  assert.equal(
    detectCriticalForecast({ ...dasar, forecast: ramalan({ hasEnoughData: false }) }),
    null,
  );
  assert.equal(
    detectCriticalForecast({ ...dasar, forecast: ramalan({ projectedRunOut: null }) }),
    null,
  );
  assert.equal(detectCriticalForecast({ ...dasar, now: t(2026, 10, 21, 10) }), null);
});

test('prediksi kritis: sudah berbunyi -> null (sekali per paket)', () => {
  const p = paket();
  const pertama = detectCriticalForecast({
    forecast: ramalan(),
    packageEnd: t(2026, 10, 20, 0),
    remainingBytes: 5 * GB,
    firedIds: [],
    pkg: p,
    now: t(2026, 10, 12, 10),
  });
  assert.ok(pertama);
  assert.equal(
    detectCriticalForecast({
      forecast: ramalan(),
      packageEnd: t(2026, 10, 20, 0),
      remainingBytes: 5 * GB,
      firedIds: [pertama.dedupKey],
      pkg: p,
      now: t(2026, 10, 12, 11),
    }),
    null,
  );
});

// --- ringkasan harian ----------------------------------------------------------

test('ringkasan harian: mati / belum jamnya / sudah terkirim hari ini -> false', () => {
  assert.equal(
    shouldSendDailySummary({
      dailySummaryEnabled: false,
      dailySummaryHour: 20,
      lastSentDateISO: null,
      now: t(2026, 10, 12, 21),
    }),
    false,
  );
  assert.equal(
    shouldSendDailySummary({
      dailySummaryEnabled: true,
      dailySummaryHour: 20,
      lastSentDateISO: null,
      now: t(2026, 10, 12, 19, 59),
    }),
    false,
  );
  assert.equal(
    shouldSendDailySummary({
      dailySummaryEnabled: true,
      dailySummaryHour: 20,
      lastSentDateISO: '2026-10-12',
      now: t(2026, 10, 12, 21),
    }),
    false,
  );
});

test('ringkasan harian: lewat jamnya dan belum terkirim hari ini -> true (tepat jamnya ikut)', () => {
  assert.equal(
    shouldSendDailySummary({
      dailySummaryEnabled: true,
      dailySummaryHour: 20,
      lastSentDateISO: '2026-10-11',
      now: t(2026, 10, 12, 21),
    }),
    true,
  );
  assert.equal(
    shouldSendDailySummary({
      dailySummaryEnabled: true,
      dailySummaryHour: 20,
      lastSentDateISO: null,
      now: t(2026, 10, 12, 20, 0),
    }),
    true,
  );
});

test('ringkasan harian: isi selalu berangka (hari ini + sisa + nama paket)', () => {
  const isi = dailySummaryContent({
    todayMobileBytes: 1.2 * GB,
    remainingBytes: 4.5 * GB,
    pkg: paket(),
  });
  assert.match(isi.body, /1\.2 GB/);
  assert.match(isi.body, /4\.5 GB/);
  assert.match(isi.body, /Kuota Utama/);
  assert.match(isi.body, /10\.0 GB/);
});

// --- state pengiriman ----------------------------------------------------------

test('state: awal kosong; klaim menambah + menolak ganda; reset mengosongkan', async () => {
  const toko = tokoBaru();
  assert.deepEqual(await loadNotificationState(toko), {
    firedIds: [],
    lastDailySummaryDateISO: null,
  });
  assert.equal(await claimFiredKey(toko, 'a'), true);
  assert.equal(await claimFiredKey(toko, 'b'), true);
  assert.equal(await claimFiredKey(toko, 'a'), false);
  assert.deepEqual((await loadNotificationState(toko)).firedIds, ['a', 'b']);
  const s3 = await markDailySummarySent(toko, '2026-10-12');
  assert.equal(s3.lastDailySummaryDateISO, '2026-10-12');
  await resetNotificationState(toko);
  assert.deepEqual(await loadNotificationState(toko), {
    firedIds: [],
    lastDailySummaryDateISO: null,
  });
});

test('state: JSON rusak / entri tidak valid -> kosong, bukan crash', async () => {
  const toko = tokoBaru({
    '@kuota-tracker:notification-state:v1': 'bukan-json{{{',
  });
  assert.deepEqual(await loadNotificationState(toko), {
    firedIds: [],
    lastDailySummaryDateISO: null,
  });
  const toko2 = tokoBaru({
    '@kuota-tracker:notification-state:v1': JSON.stringify({
      firedIds: ['baik', 123, null],
      lastDailySummaryDateISO: 'bukan-tanggal',
    }),
  });
  assert.deepEqual(await loadNotificationState(toko2), {
    firedIds: ['baik'],
    lastDailySummaryDateISO: null,
  });
});
