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

## Build & release Android (GitHub Actions)

Workflow `.github/workflows/android-release.yml` jalan saat push tag `v*`
(misal `v0.1.0`) atau manual via tab Actions > android release > Run workflow.
Hasilnya: artifact `android` + GitHub Release di tag itu.

```bash
git tag v0.1.0
git push origin v0.1.0
```

Isi release:

- `app-<abi>-release-signed.apk` — APK release bertanda tangan, satu per
  arsitektur (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`). Install yang
  sesuai arsitektur HP (umumnya `arm64-v8a`).
- `app-<abi>-debug.apk` — APK debug, satu per arsitektur.
- `app-release-signed.aab` — bundle release bertanda tangan, untuk Play Store.

APK/AAB bertanda tangan hanya dibuat kalau 4 secrets ini ada di
Settings > Secrets and variables > Actions:

- `ANDROID_KEYSTORE_BASE64` — isi `release.keystore` di-encode base64.
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Tanpa 4 secrets itu, workflow tetap jalan tapi release hanya berisi
APK debug (`app-<abi>-debug.apk`). Keystore dibuat sekali, di mesinmu sendiri (jangan commit
ke repo):

```bash
keytool -genkeypair -v -keystore release.keystore -alias kuota-tracker \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore
```
