# Kuota Tracker

Tracker kuota data seluler + wifi, gaya ringkasan pemakaian data (total, rata-rata harian,
per-aplikasi), plus kartu paket: sisa kuota, proyeksi habis, dan status aman/mepet/kritis.
Default paket: 13 GB / 5 hari.

## Dua mode

| Mode | Data | Cara jalan |
| --- | --- | --- |
| Expo Go | data **contoh** (dilabeli di UI) | `npx expo start`, scan QR |
| Dev build | data **asli** dari Android (`NetworkStatsManager`) | `npx expo prebuild` lalu `npx expo run:android`, atau EAS dev build |

Expo Go tidak bisa membaca pemakaian data asli — Android hanya mengizinkan itu lewat
modul native + izin "Akses penggunaan". iOS tidak didukung (Apple tidak membuka API-nya
ke aplikasi pihak ketiga).

## Jalankan (Expo Go, data contoh)

```bash
npx expo start
```

## Jalankan (dev build, data asli)

```bash
npx expo prebuild --platform android
npx expo run:android
```

Saat pertama dibuka di dev build, app menampilkan tombol **izinkan akses penggunaan**
— tap, lalu aktifkan Kuota Tracker di Settings > Akses penggunaan. Tanpa izin ini,
`NetworkStatsManager` melempar `SecurityException` dan app jatuh ke data contoh.

## Struktur

- `src/app/` — Expo Router: `_layout.tsx`, `index.tsx` (layar ringkasan).
- `src/components/` — `UsageRing`, `StatCards`, `PeriodTabs`, `PackageCard`, `AppUsageList`.
- `src/lib/usageStats.ts` — jembatan data: coba modul native, fallback data contoh.
- `src/lib/quota.ts` — logika paket: sisa, rata-rata harian, proyeksi habis, status.
- `src/lib/format.ts` — format bytes/tanggal.
- `modules/usage-stats/` — modul native lokal (Expo Modules API, Android saja):
  `UsageStatsModule.kt` baca `NetworkStatsManager` (total perangkat + per-UID per aplikasi).
- `plugins/withUsageStatsPermission.js` — config plugin yang menambahkan
  `android.permission.PACKAGE_USAGE_STATS` ke AndroidManifest.

## Catatan implementasi

- Per-aplikasi: `querySummary()` per UID, dipetakan ke nama paket via
  `PackageManager.getPackagesForUid()`. UID shared (misal layanan Google) bisa
  menggabungkan beberapa paket — angka per-app adalah perkiraan terbaik yang
  Android izinkan, bukan audit forensik.
- `subscriberId: null` dipakai untuk mobile — berlaku untuk langganan default.
- Angka `NetworkStatsManager` dihitung sejak boot / reset statistik sistem, bukan
  sejak paket dibeli — makanya kartu paket memakai jendela "sejak paket mulai".
- Perintah install: pakai `npx expo install ...`, bukan `npm add`, supaya versi
  sesuai SDK. Resolusi peer yang gagal di `npm install` murni diatasi dengan
  `npm install --legacy-peer-deps` (konfliknya di `react-native-worklets`, peer
  opsional dari `expo-modules-core`).
