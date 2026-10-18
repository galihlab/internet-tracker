# Kuota Tracker

Pelacak kuota data seluler Android: sisa kuota, pemakaian per aplikasi,
prediksi habis, dan peringatan — dari data asli perangkat, semuanya
tersimpan lokal di HP, tanpa server dan tanpa analytics.

## Fitur

- **Beranda** — sisa kuota paket aktif, pemakaian hari ini, prediksi
  (cukup / mepet / kritis), dan tiga aplikasi teratas.
- **Statistik** — grafik batang pemakaian harian (seluler + Wi-Fi),
  grafik kumulatif terhadap laju ideal paket, rata-rata hari penuh,
  hari terboros, dan aplikasi teratas per periode.
- **Aplikasi** — pemakaian per aplikasi dalam jendela paket berjalan.
- **Pengaturan** — nama, paket aktif + riwayat paket, notifikasi
  (ambang 50/80/100%, ringkasan harian), dan status izin.
- **Notifikasi** — peringatan ambang (sekali per paket), peringatan
  lonjakan pemakaian, pengingat prediksi kritis, dan ringkasan harian
  lewat tugas terjadwal sistem.

## Cara kerja data

Angka seluler dibaca dari `NetworkStatsManager` (Android) lewat modul
native lokal `modules/usage-stats/` + izin **Akses penggunaan**.
Kuota hanya menghitung seluler — Wi-Fi tidak pernah mengurangi kuota.
Semua data tersimpan di perangkat (AsyncStorage); tidak ada yang
dikirim ke server mana pun. iOS tidak didukung: Apple tidak membuka
API pemakaian data ke aplikasi pihak ketiga.

## Jalankan (pengembangan)

Butuh Node 22 dan Android SDK. Jalankan lewat dev build (bukan Expo Go
— Expo Go tidak bisa memuat modul native, jadi hanya tampil data contoh):

```bash
npm install --legacy-peer-deps
npx expo prebuild --platform android
npx expo run:android
```

Saat pertama dibuka, tap **Buka pengaturan izin**, lalu aktifkan
Kuota Tracker di Pengaturan sistem › Akses penggunaan. Tanpa izin ini
tidak ada angka asli yang bisa dibaca.

## Uji

```bash
npm test          # unit test logika murni (node:test)
npx tsc --noEmit  # cek tipe
npm run lint      # lint
```

## Build & release (GitHub Actions)

Workflow `.github/workflows/android-release.yml` jalan saat push tag
`v*` (misal `v1.0.1`) atau manual via tab Actions. Hasilnya: GitHub
Release di tag itu berisi APK release bertanda tangan per arsitektur
(`app-arm64-v8a-release-signed.apk` untuk kebanyakan HP Android
modern, plus `armeabi-v7a`, `x86`, `x86_64`) dan `app-release-signed.aab`
untuk Play Store.

APK/AAB bertanda tangan hanya dibuat kalau 4 secrets ini ada di repo:

- `ANDROID_KEYSTORE_BASE64` — keystore release, base64
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Tanpa secrets, workflow hanya menghasilkan APK debug.

## Struktur

- `src/app/` — Expo Router: `welcome`, `alerts`, `app-detail`,
  `package-detail`, dan tab `(tabs)/index` (Beranda),
  `(tabs)/statistik`, `(tabs)/aplikasi`, `(tabs)/pengaturan`.
- `src/components/` — kartu dan komponen UI (kartu kuota, grafik,
  daftar aplikasi, tab bar, header).
- `src/lib/` — logika: `quota` (sisa/proyeksi/status),
  `usageStats` (jembatan modul native), `dailyBuckets` (riwayat harian),
  `summarySnapshots` (snapshot angka tersimpan), `settings`/`storage`
  (pengaturan), `notify` + `notificationTask` (peringatan latar),
  `format`, `windows`, `appIcons`, `appUsage`.
- `src/theme/` — token desain (warna, tipografi, radius, spasi).
- `modules/usage-stats/` — modul native lokal (Expo Modules API,
  Android saja): baca `NetworkStatsManager` (total perangkat + per-UID
  per aplikasi).
- `plugins/` — config plugin Expo: izin `PACKAGE_USAGE_STATS`,
  bundle-in-debug, minify + R8 keep rules (Room/WorkManager),
  ABI splits.

## Catatan implementasi

- Per-aplikasi: `querySummary()` per UID, dipetakan ke nama paket via
  `PackageManager.getPackagesForUid()`. UID shared (misal layanan
  Google) bisa menggabungkan beberapa paket — angka per-app adalah
  perkiraan terbaik yang Android izinkan, bukan audit forensik.
- `subscriberId: null` dipakai untuk mobile — berlaku untuk
  langganan default.
- Angka `NetworkStatsManager` dihitung sejak boot / reset statistik
  sistem, bukan sejak paket dibeli — makanya kartu paket memakai
  jendela "sejak paket mulai".
- Perintah install: pakai `npx expo install ...`, bukan `npm add`,
  supaya versi sesuai SDK. Resolusi peer yang gagal di `npm install`
  murni diatasi dengan `npm install --legacy-peer-deps` (konfliknya di
  `react-native-worklets`, peer opsional dari `expo-modules-core`).
- Jangan edit `android/` manual — semua kustomisasi Android lewat
  config plugin di `plugins/` + `app.json`.

## Kontribusi

Issue dan PR dipersilakan. Untuk perubahan perilaku, sertakan bukti:
hasil `npm test`, `npx tsc --noEmit`, dan `npm run lint`.

## Lisensi

Belum ada file LICENSE di repo ini — sampai lisensi dipilih, kode
tetap dengan semua hak dilindungi (all rights reserved).
