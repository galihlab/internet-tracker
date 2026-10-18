// Config plugin: keep rules ProGuard/R8 untuk Room + WorkManager.
//
// Latar: v1.0.0 force close <1 detik di Pixel 10 Pro dengan
//   "Failed to create an instance of class androidx.work.impl.WorkDatabase"
// di androidx.startup.InitializationProvider -> WorkManagerInitializer.
// WorkManager membuat database internalnya (WorkDatabase) lewat refleksi
// Room (Class.forName("<nama>_Impl") + newInstance). R8 mengupas
// konstruktor / companion yang hanya dipakai lewat refleksi, sehingga
// instansiasi gagal SEBELUM bundle JS sempat jalan — layar diagnostik JS
// tidak bisa menangkap crash ini.
//
// Aturan ini memaksa R8 mempertahankan:
// - seluruh kelas di androidx.work.impl (WorkDatabase, WorkDatabase_Impl,
//   DAO hasil generate, helper) beserta semua membernya,
// - semua subclass RoomDatabase + kelas @Database beserta semua membernya,
// - konstruktor subclass RoomDatabase (yang dipakai newInstance() refleksi).
// Idempotent: menjalankan prebuild berulang tidak menduplikasi aturan.
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# withRoomKeepRules: keep Room + WorkManager (lihat plugins/withRoomKeepRules.js)';

const RULES = `${MARKER}
# WorkManager membuat WorkDatabase lewat refleksi Room — jangan kupas.
-keep class androidx.work.impl.** { *; }
# Room: database + implementasi hasil generate diakses lewat refleksi.
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Database class * { *; }
# Konstruktor subclass RoomDatabase dipakai newInstance() refleksi.
-keepclassmembers class * extends androidx.room.RoomDatabase { <init>(...); }
`;

module.exports = function withRoomKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const proguardPath = path.join(
        config.modRequest.projectRoot,
        'android',
        'app',
        'proguard-rules.pro'
      );
      let contents = fs.readFileSync(proguardPath, 'utf8');
      if (!contents.includes(MARKER)) {
        if (!contents.endsWith('\n')) {
          contents += '\n';
        }
        contents += `\n${RULES}`;
        fs.writeFileSync(proguardPath, contents);
      }
      return config;
    },
  ]);
};
