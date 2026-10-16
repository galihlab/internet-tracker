/**
 * Config plugin: menambahkan android.permission.PACKAGE_USAGE_STATS ke AndroidManifest.
 * Izin ini WAJIB dideklarasikan agar NetworkStatsManager mau mengembalikan data,
 * dan agar halaman "Akses penggunaan" di Settings bisa memberi izin ke aplikasi.
 * Catatan: izin ini tidak bisa diminta lewat dialog runtime biasa — user harus
 * mengaktifkannya manual di Settings > Akses penggunaan.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const USAGE_STATS_PERMISSION = 'android.permission.PACKAGE_USAGE_STATS';

module.exports = function withUsageStatsPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    const exists = manifest['uses-permission'].some(
      (p) => p.$ && p.$['android:name'] === USAGE_STATS_PERMISSION,
    );
    if (!exists) {
      manifest['uses-permission'].push({
        $: { 'android:name': USAGE_STATS_PERMISSION },
      });
    }
    return config;
  });
};
