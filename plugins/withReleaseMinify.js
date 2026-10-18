// Config plugin: aktifkan R8 minify + resource shrinking HANYA untuk build release.
// Template Expo mengikat kedua setelan ini ke properti Gradle:
//   minifyEnabled enableMinifyInReleaseBuilds
//   shrinkResources enableShrinkResources.toBoolean()   // dari android.enableShrinkResourcesInReleaseBuilds
// Properti minify memang true di template, tapi properti shrinkResources
// tidak disetel template manapun sehingga jatuh ke 'false'. Plugin ini
// mengganti kedua baris tersebut dengan literal `true` di dalam blok
// release saja; blok debug tidak punya baris-baris ini dan tidak disentuh.
// `shrinkResources` hanya berpengaruh bila `minifyEnabled` true, jadi
// keduanya disetel bersama. Baris `def enableShrinkResources = ...`
// dihapus karena sudah mati setelah baris shrinkResources diganti literal.
// Idempotent: menjalankan prebuild berulang menghasilkan blok yang sama.
// Keep rules: aturan tambahan DIBUTUHKAN untuk Room + WorkManager
// (lihat plugins/withRoomKeepRules.js). Klaim lama "tidak ada aturan
// tambahan yang dibutuhkan" terbukti salah oleh crash startup v1.0.0:
// R8 mengupas konstruktor yang hanya dipakai refleksi Room sehingga
// WorkManager gagal membuat WorkDatabase sebelum JS jalan.
// Dependensi lain (expo-modules-core, react-native, dst.) tetap ter-cover
// consumer rules-nya masing-masing.
const { withAppBuildGradle } = require('@expo/config-plugins');

function enableReleaseMinify(contents) {
  const lines = contents.split('\n');
  let inBuildTypes = false;
  let inRelease = false;
  let depth = 0; // brace depth relatif terhadap buildTypes {
  let sawMinify = false;
  let sawShrink = false;
  const out = [];
  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (!inBuildTypes && /^\s*buildTypes\s*\{/.test(line)) {
      inBuildTypes = true;
      depth = 0;
    }
    if (inBuildTypes && !inRelease && /^\s*release\s*\{/.test(line)) {
      inRelease = true;
    }
    let skip = false;
    let newLine = line;
    if (inRelease) {
      if (/^\s*def\s+enableShrinkResources\s*=/.test(line)) {
        // Mati setelah baris shrinkResources di bawah diganti literal true.
        skip = true;
      } else if (/^\s*minifyEnabled\s/.test(line)) {
        sawMinify = true;
        newLine = line.replace(/minifyEnabled\s+.*$/, 'minifyEnabled true');
      } else if (/^\s*shrinkResources\s/.test(line)) {
        sawShrink = true;
        newLine = line.replace(/shrinkResources\s+.*$/, 'shrinkResources true');
      }
    }
    if (inBuildTypes) {
      depth += opens - closes;
      if (inRelease && depth <= 1) {
        // Kurung tutup blok release: sisipkan baris yang belum ada
        // (cadangan bila template masa depan menghapusnya).
        if (!sawMinify) {
          out.push('            minifyEnabled true');
        }
        if (!sawShrink) {
          out.push('            shrinkResources true');
        }
        inRelease = false;
      }
      if (depth <= 0) {
        inBuildTypes = false;
        inRelease = false;
      }
    }
    if (!skip) {
      out.push(newLine);
    }
  }
  return out.join('\n');
}

module.exports = function withReleaseMinify(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = enableReleaseMinify(
      config.modResults.contents
    );
    return config;
  });
};
