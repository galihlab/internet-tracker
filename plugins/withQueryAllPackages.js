/**
 * Config plugin: menambahkan android.permission.QUERY_ALL_PACKAGES ke AndroidManifest.
 *
 * Kenapa ini WAJIB untuk pelacak kuota: sejak Android 11 (API 30), aturan
 * visibilitas paket menyembunyikan sebagian besar aplikasi pihak ketiga
 * dari aplikasi yang tidak mendeklarasikan izin ini. Akibatnya
 * PackageManager.getPackagesForUid() mengembalikan null untuk UID
 * aplikasi-aplikasi itu, dan modul native melewatkan bucket-nya
 * (`continue`) — aplikasinya hilang dari daftar per aplikasi, dan
 * angkanya hanya muncul sebagai selisih di baris "Sistem dan lainnya".
 * Itulah biang hilangnya TikTok dkk, BUKAN limit top-10 (yang sudah
 * dinaikkan ke 200 di v1.0.3 tanpa hasil).
 *
 * QUERY_ALL_PACKAGES adalah izin level normal (bukan runtime): otomatis
 * diberikan saat install, tidak perlu dialog. Untuk rilis Play Store,
 * izin ini perlu deklarasi justifikasi (fungsi inti aplikasi memang
 * menampilkan pemakaian per aplikasi — kasus yang diizinkan Play).
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const QUERY_ALL_PACKAGES_PERMISSION = 'android.permission.QUERY_ALL_PACKAGES';

module.exports = function withQueryAllPackages(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    const exists = manifest['uses-permission'].some(
      (p) => p.$ && p.$['android:name'] === QUERY_ALL_PACKAGES_PERMISSION,
    );
    if (!exists) {
      manifest['uses-permission'].push({
        $: { 'android:name': QUERY_ALL_PACKAGES_PERMISSION },
      });
    }
    return config;
  });
};
