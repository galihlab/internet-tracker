// Uji unit pengingat internet (v1.3.0) + parse pengaturan — node:test +
// node:assert, tanpa dependensi React Native / Expo / modul native.
// Yang diuji: detektor murni di notifications.ts (batas harian total,
// batas per aplikasi, pemakaian malam), kunci riwayat di quota.ts,
// dan validasi parseSettings di storage.ts (pkg null = tanpa paket,
// bidang pengingat baru, blob rusak -> bawaan).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectDailyInternetBudget,
  detectOvernightUsage,
  detectPerAppBudgets,
  overnightWindowFor,
  OVERNIGHT_THRESHOLD_BYTES,
} from '../notifications.ts';
import { historyEntryKey } from '../quota.ts';
import { defaultSettings, parseSettings } from '../settingsParse.ts';
import {
  claimFiredKey,
  loadNotificationState,
  resetNotificationState,
} from '../notificationState.ts';

// Tanggal lokal eksplisit supaya uji tidak bergantung zona waktu mesin.
const t = (y, m, d, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s);
const GB = 1024 ** 3;
const MB = 1024 ** 2;

// --- batas harian total internet ------------------------------------------

test('batas harian: belum tercapai -> null; tercapai -> satu temuan berangka', () => {
  assert.equal(
    detectDailyInternetBudget({
      todayTotalBytes: 3.9 * GB,
      budgetBytes: 4 * GB,
      firedIds: [],
      now: t(2026, 10, 20, 18),
    }),
    null,
  );
  const temuan = detectDailyInternetBudget({
    todayTotalBytes: 4.2 * GB,
    budgetBytes: 4 * GB,
    firedIds: [],
    now: t(2026, 10, 20, 18),
  });
  assert.equal(temuan?.kind, 'batas-harian');
  assert.equal(temuan?.dedupKey, 'batas-harian:2026-10-20');
  assert.match(temuan?.detail ?? '', /4\.2 GB/);
  assert.match(temuan?.detail ?? '', /4\.0 GB/);
});

test('batas harian: batas 0 (mati) tidak pernah berbunyi; sudah berbunyi -> null', () => {
  assert.equal(
    detectDailyInternetBudget({
      todayTotalBytes: 99 * GB,
      budgetBytes: 0,
      firedIds: [],
      now: t(2026, 10, 20, 18),
    }),
    null,
  );
  assert.equal(
    detectDailyInternetBudget({
      todayTotalBytes: 4.2 * GB,
      budgetBytes: 4 * GB,
      firedIds: ['batas-harian:2026-10-20'],
      now: t(2026, 10, 20, 18),
    }),
    null,
  );
});

// --- batas per aplikasi -----------------------------------------------------

test('batas per aplikasi: hanya aplikasi yang melewati batasnya yang dilaporkan', () => {
  const temuan = detectPerAppBudgets({
    perAppToday: [
      { packageName: 'com.zhiliaoapp.musically', label: 'TikTok', bytes: 2.5 * GB },
      { packageName: 'com.google.android.youtube', label: 'YouTube', bytes: 0.5 * GB },
    ],
    budgets: [
      { packageName: 'com.zhiliaoapp.musically', label: 'TikTok', budgetBytes: 2 * GB },
      { packageName: 'com.google.android.youtube', label: 'YouTube', budgetBytes: 2 * GB },
    ],
    firedIds: [],
    now: t(2026, 10, 20, 18),
  });
  assert.equal(temuan.length, 1);
  assert.equal(temuan[0].kind, 'batas-aplikasi');
  assert.equal(temuan[0].dedupKey, 'batas-aplikasi:2026-10-20:com.zhiliaoapp.musically');
  assert.match(temuan[0].detail, /TikTok/);
  assert.match(temuan[0].detail, /2\.5 GB/);
});

test('batas per aplikasi: sudah berbunyi / tanpa pemakaian hari ini -> dilewati', () => {
  const temuan = detectPerAppBudgets({
    perAppToday: [{ packageName: 'com.zhiliaoapp.musically', label: 'TikTok', bytes: 2.5 * GB }],
    budgets: [
      { packageName: 'com.zhiliaoapp.musically', label: 'TikTok', budgetBytes: 2 * GB },
      { packageName: 'com.whatsapp', label: 'WhatsApp', budgetBytes: 1 * GB },
    ],
    firedIds: ['batas-aplikasi:2026-10-20:com.zhiliaoapp.musically'],
    now: t(2026, 10, 20, 18),
  });
  assert.deepEqual(temuan, []);
});

// --- pemakaian malam --------------------------------------------------------

test('jendela malam: sebelum jam 06:00 -> null; sesudahnya -> [00:00, 06:00) hari itu', () => {
  assert.equal(overnightWindowFor(t(2026, 10, 20, 5, 59)), null);
  const jendela = overnightWindowFor(t(2026, 10, 20, 7, 30));
  assert.notEqual(jendela, null);
  assert.equal(jendela?.nightDateISO, '2026-10-20');
  assert.equal(new Date(jendela?.start ?? 0).getHours(), 0);
  assert.equal(new Date(jendela?.end ?? 0).getHours(), 6);
});

test('pemakaian malam: di bawah ambang -> null; di atas ambang -> satu temuan', () => {
  assert.equal(
    detectOvernightUsage({
      nightTotalBytes: 100 * MB,
      firedIds: [],
      now: t(2026, 10, 20, 7, 30),
    }),
    null,
  );
  const temuan = detectOvernightUsage({
    nightTotalBytes: 800 * MB,
    firedIds: [],
    now: t(2026, 10, 20, 7, 30),
  });
  assert.equal(temuan?.kind, 'pemakaian-malam');
  assert.equal(temuan?.dedupKey, 'pemakaian-malam:2026-10-20');
  assert.match(temuan?.detail ?? '', /800/);
});

test('pemakaian malam: sebelum jam 06:00 tidak pernah berbunyi; sudah berbunyi -> null', () => {
  assert.equal(
    detectOvernightUsage({
      nightTotalBytes: 5 * GB,
      firedIds: [],
      now: t(2026, 10, 20, 3, 0),
    }),
    null,
  );
  assert.equal(
    detectOvernightUsage({
      nightTotalBytes: 5 * GB,
      firedIds: ['pemakaian-malam:2026-10-20'],
      now: t(2026, 10, 20, 7, 30),
    }),
    null,
  );
});

test('ambang pemakaian malam adalah 500 MB', () => {
  assert.equal(OVERNIGHT_THRESHOLD_BYTES, 500 * MB);
});

// --- kunci riwayat ------------------------------------------------------------

test('kunci riwayat: startDate + archivedAt — dua arsip paket sama dibedakan', () => {
  const dasar = {
    name: 'Kuota Utama',
    quotaBytes: 13 * GB,
    startDate: '2026-10-10',
    durationDays: 5,
    operator: 'Telkomsel',
    network: '4G/5G',
  };
  const a = { ...dasar, archivedAt: 1000 };
  const b = { ...dasar, archivedAt: 2000 };
  assert.equal(historyEntryKey(a), '2026-10-10|1000');
  assert.notEqual(historyEntryKey(a), historyEntryKey(b));
});

// --- parse pengaturan ---------------------------------------------------------

test('parse: pkg null eksplisit dipertahankan (tanpa paket), bukan paket bawaan', () => {
  const parsed = parseSettings(JSON.stringify({ ...defaultSettings(), pkg: null }));
  assert.equal(parsed.pkg, null);
});

test('parse: pkg hilang (blob lama) jatuh ke paket bawaan; bidang pengingat baru tervalidasi', () => {
  const { pkg: _buang, ...tanpaPkg } = defaultSettings();
  void _buang;
  const parsed = parseSettings(
    JSON.stringify({
      ...tanpaPkg,
      dailyInternetBudgetBytes: 4 * GB,
      perAppBudgets: [
        { packageName: 'com.zhiliaoapp.musically', label: 'TikTok', budgetBytes: 2 * GB },
        { packageName: '', label: 'Rusak', budgetBytes: -1 },
      ],
      overnightAlertEnabled: false,
    }),
  );
  assert.notEqual(parsed.pkg, null);
  assert.equal(parsed.pkg?.name, 'Kuota Utama');
  assert.equal(parsed.dailyInternetBudgetBytes, 4 * GB);
  assert.deepEqual(parsed.perAppBudgets, [
    { packageName: 'com.zhiliaoapp.musically', label: 'TikTok', budgetBytes: 2 * GB },
  ]);
  assert.equal(parsed.overnightAlertEnabled, false);
});

test('parse: blob rusak / bidang pengingat tidak valid -> bawaan', () => {
  const parsed = parseSettings(
    JSON.stringify({
      dailyInternetBudgetBytes: -5,
      perAppBudgets: 'bukan-daftar',
      overnightAlertEnabled: 'ya',
    }),
  );
  assert.equal(parsed.dailyInternetBudgetBytes, 0);
  assert.deepEqual(parsed.perAppBudgets, []);
  assert.equal(parsed.overnightAlertEnabled, true);
  assert.equal(parseSettings('bukan json{').pkg?.name, 'Kuota Utama');
});

/* Klaim atomik dedup notifikasi (perbaikan notifikasi ganda v1.3.1) */

/** Toko palsu: getItem/setItem + claimKey atomik via Set (sinkron). */
function tokoPalsu({ atomik = true } = {}) {
  const kv = new Map();
  const klaim = new Set();
  const toko = {
    getItem: async (k) => (kv.has(k) ? kv.get(k) : null),
    setItem: async (k, v) => {
      kv.set(k, v);
    },
  };
  if (atomik) {
    toko.claimKey = async (k) => {
      if (klaim.has(k)) return false;
      klaim.add(k);
      return true;
    };
    toko.clearClaimKeys = async (prefix) => {
      for (const k of [...klaim]) if (k.startsWith(prefix)) klaim.delete(k);
    };
  }
  return toko;
}

test('klaim: dua pelari bersamaan hanya satu pemenang', async () => {
  const toko = tokoPalsu();
  const [a, b] = await Promise.all([
    claimFiredKey(toko, 'pemakaian-malam:2026-10-20'),
    claimFiredKey(toko, 'pemakaian-malam:2026-10-20'),
  ]);
  assert.equal([a, b].filter(Boolean).length, 1, 'tepat satu pemenang');
  const state = await loadNotificationState(toko);
  assert.ok(state.firedIds.includes('pemakaian-malam:2026-10-20'));
  // Klaim kedua berurutan juga ditolak.
  assert.equal(await claimFiredKey(toko, 'pemakaian-malam:2026-10-20'), false);
});

test('klaim: kunci yang sudah ada di firedIds (riwayat lama) langsung ditolak', async () => {
  const toko = tokoPalsu();
  await toko.setItem(
    '@kuota-tracker:notification-state:v1',
    JSON.stringify({ firedIds: ['ambang:80:lama'], lastDailySummaryDateISO: null }),
  );
  assert.equal(await claimFiredKey(toko, 'ambang:80:lama'), false);
});

test('klaim: tanpa claimKey atomik tetap bisa klaim (fallback)', async () => {
  const toko = tokoPalsu({ atomik: false });
  assert.equal(await claimFiredKey(toko, 'batas-harian:2026-10-20'), true);
});

test('reset: membersihkan klaim sehingga kunci bisa diklaim ulang', async () => {
  const toko = tokoPalsu();
  assert.equal(await claimFiredKey(toko, 'batas-harian:2026-10-20'), true);
  await resetNotificationState(toko);
  assert.equal(await claimFiredKey(toko, 'batas-harian:2026-10-20'), true);
});
