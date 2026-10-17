// Config plugin: biarkan build type release TANPA signingConfig.
// Template Expo menandatangani release dengan signingConfigs.debug, jadi
// assembleRelease/bundleRelease menghasilkan APK/AAB bertanda tangan debug
// — bukan unsigned. Workflow CI (.github/workflows/android-release.yml)
// mengasumsikan artefak unsigned (app-*-release-unsigned.apk dan
// app-release.aab) lalu menandatanganinya sendiri dengan keystore release
// via apksigner/jarsigner. Plugin ini menghapus baris signingConfig dari
// blok release saja; blok debug tetap memakai signingConfigs.debug.
const { withAppBuildGradle } = require('@expo/config-plugins');

function stripReleaseSigning(contents) {
  const lines = contents.split('\n');
  let inBuildTypes = false;
  let inRelease = false;
  let depth = 0; // brace depth relatif terhadap buildTypes {
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
    const isReleaseSigning =
      inRelease && /^\s*signingConfig\s+signingConfigs\.debug\s*$/.test(line);
    if (!isReleaseSigning) {
      out.push(line);
    }
    if (inBuildTypes) {
      depth += opens - closes;
      if (inRelease && depth <= 1) {
        inRelease = false;
      }
      if (depth <= 0) {
        inBuildTypes = false;
        inRelease = false;
      }
    }
  }
  return out.join('\n');
}

module.exports = function withUnsignedRelease(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = stripReleaseSigning(
      config.modResults.contents
    );
    return config;
  });
};
