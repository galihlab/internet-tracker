// Config plugin: embed the JS bundle into debug APKs.
// react-native-gradle-plugin treats "debug" as a debuggable variant by
// default and SKIPS bundling the JS bundle + assets for it, expecting the
// app to load JS from the Metro dev server. A standalone debug APK
// installed on a phone without Metro then shows the red screen
// "Unable to load script ... index.android.bundle".
// Setting debuggableVariants = [] makes every variant (including debug)
// bundle its JS, so the APK runs standalone.
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withBundleInDebug(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (/^\s*debuggableVariants\s*=/m.test(contents)) {
      return config; // already set, don't duplicate
    }
    config.modResults.contents = contents.replace(
      /\/\/ debuggableVariants = .*/,
      `$&\n    debuggableVariants = []`
    );
    return config;
  });
};
