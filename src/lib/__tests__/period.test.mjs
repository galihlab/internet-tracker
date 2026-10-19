// Uji unit rentang custom (v1.1.0) — node:test + node:assert, tanpa
// dependensi React Native / Expo / modul native. Yang diuji: helper
// murni di windows.ts (normalisasi tukar awal-akhir, jendela
// [awal hari mulai, akhir hari selesai) dengan akhir dipotong di now).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  customRangeWindow,
  normalizeCustomRange,
} from '../windows.ts';

// Tanggal lokal eksplisit supaya uji tidak bergantung zona waktu mesin.
const t = (y, m, d, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();
const HARI = 24 * 60 * 60 * 1000;

test('normalizeCustomRange mempertahankan urutan yang sudah benar', () => {
  assert.deepEqual(
    normalizeCustomRange({ startDateISO: '2026-10-12', endDateISO: '2026-10-15' }),
    { startDateISO: '2026-10-12', endDateISO: '2026-10-15' },
  );
});

test('normalizeCustomRange menukar awal yang melewati akhir', () => {
  assert.deepEqual(
    normalizeCustomRange({ startDateISO: '2026-10-15', endDateISO: '2026-10-12' }),
    { startDateISO: '2026-10-12', endDateISO: '2026-10-15' },
  );
});

test('customRangeWindow: awal hari mulai sampai akhir hari selesai', () => {
  const now = new Date(t(2026, 10, 19, 12));
  const w = customRangeWindow(
    { startDateISO: '2026-10-12', endDateISO: '2026-10-15' },
    now,
  );
  assert.equal(w.start, t(2026, 10, 12));
  assert.equal(w.end, t(2026, 10, 16));
});

test('customRangeWindow: akhir hari ini dipotong di now, bukan mengarang sisa hari', () => {
  const now = new Date(t(2026, 10, 19, 12));
  const w = customRangeWindow(
    { startDateISO: '2026-10-18', endDateISO: '2026-10-19' },
    now,
  );
  assert.equal(w.start, t(2026, 10, 18));
  assert.equal(w.end, now.getTime());
});

test('customRangeWindow: rentang terbalik dinormalisasi dulu', () => {
  const now = new Date(t(2026, 10, 19, 12));
  const w = customRangeWindow(
    { startDateISO: '2026-10-15', endDateISO: '2026-10-12' },
    now,
  );
  assert.equal(w.start, t(2026, 10, 12));
  assert.equal(w.end, t(2026, 10, 16));
});

test('customRangeWindow: satu hari yang sama = jendela hari itu', () => {
  const now = new Date(t(2026, 10, 19, 12));
  const w = customRangeWindow(
    { startDateISO: '2026-10-15', endDateISO: '2026-10-15' },
    now,
  );
  assert.equal(w.start, t(2026, 10, 15));
  assert.equal(w.end, t(2026, 10, 15) + HARI);
});
