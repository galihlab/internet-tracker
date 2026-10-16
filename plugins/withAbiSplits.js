// Config plugin: split the APK per ABI so each device downloads only the
// native libraries for its own architecture instead of all four ABIs
// (arm64-v8a, armeabi-v7a, x86, x86_64) in one fat APK. Without this,
// assembleDebug produces a single ~190 MB APK; with splits it produces
// one APK per ABI (~1/3 the size each for a debug build).
const { withAppBuildGradle } = require('@expo/config-plugins');

const SPLITS_BLOCK = `
    splits {
        abi {
            enable true
            reset()
            include 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'
            universalApk false
        }
    }
`;

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes('splits {')) {
      return config; // already applied, don't duplicate
    }
    config.modResults.contents = contents.replace(
      /android\s*\{/,
      `android {${SPLITS_BLOCK}`
    );
    return config;
  });
};
