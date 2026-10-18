// Uji unit buildPolylinePoints — regresi crash Statistik v1.0.1.
// `points` Polyline tidak boleh mengandung perintah path "M"/"L": library
// membangun `d` sebagai "M" + points, jadi perintah di dalam `points`
// menghasilkan "MM..." dan native melempar IllegalArgumentException.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPolylinePoints } from '../chartPoints.ts';

test('points hanya berisi pasangan koordinat, tanpa perintah M/L', () => {
  const points = buildPolylinePoints([
    { x: 12, y: 106 },
    { x: 24.5, y: 90.25 },
  ]);
  assert.equal(points, '12.0,106.0 24.5,90.3');
  assert.ok(!/[ML]/.test(points), 'points tidak boleh mengandung M atau L');
});

test('satu titik dan daftar kosong', () => {
  assert.equal(buildPolylinePoints([{ x: 12, y: 106 }]), '12.0,106.0');
  assert.equal(buildPolylinePoints([]), '');
});
