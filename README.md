# Kuota Tracker

[![Android release](https://github.com/galihlab/kuota-tracker/actions/workflows/android-release.yml/badge.svg)](https://github.com/galihlab/kuota-tracker/actions/workflows/android-release.yml)
[![Latest release](https://img.shields.io/github/v/release/galihlab/kuota-tracker)](https://github.com/galihlab/kuota-tracker/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Android](https://img.shields.io/badge/Platform-Android-3DDC84.svg)]
[![Expo SDK 58](https://img.shields.io/badge/Expo%20SDK-58-000020.svg)]

Android mobile-data quota tracker: remaining quota, per-app usage,
run-out forecast, and alerts — from real on-device data, stored locally
on the phone. No server, no analytics.

## Features

- **Home** — active package remaining quota, today's usage, forecast
  (enough / tight / critical), and the top three apps.
- **Statistics** — daily usage bar chart (mobile + Wi-Fi), cumulative
  usage vs. the package's ideal-pace line, full-day average, heaviest
  day, and top app per period.
- **Apps** — per-app usage inside the running package window.
- **Settings** — name, active package + package history, notifications
  (50/80/100% thresholds, daily summary), and permission status.
- **Notifications** — threshold alerts (once per package), usage-spike
  alerts, critical-forecast reminders, and a daily summary via a
  system-scheduled background task.

## How data works

Mobile numbers are read from `NetworkStatsManager` (Android) through the
local native module `modules/usage-stats/` + the **Usage access**
permission. Quota counts mobile data only — Wi-Fi never reduces quota.
Everything is stored on the device (SQLite local DB, a single
`kuota-tracker.db` file); nothing is sent to any server. iOS is not
supported: Apple does not expose data-usage APIs to third-party apps.

## Run (development)

Requires Node 22 and the Android SDK. Run via a dev build (not Expo Go
— Expo Go cannot load the native module, so it only shows sample data):

```bash
npm install --legacy-peer-deps
npx expo prebuild --platform android
npx expo run:android
```

On first launch, tap **Open permission settings**, then enable
Kuota Tracker in System Settings › Usage access. Without this
permission no real numbers can be read.

## Test

```bash
npm test          # pure-logic unit tests (node:test)
npx tsc --noEmit  # typecheck
npm run lint      # lint
```

## Build & release (GitHub Actions)

The `.github/workflows/android-release.yml` workflow runs when a `v*`
tag is pushed (e.g. `v1.0.4`) or manually via the Actions tab. It
produces a GitHub Release on that tag containing signed release APKs
per architecture (`app-arm64-v8a-release-signed.apk` for most modern
Android phones, plus `armeabi-v7a`, `x86`, `x86_64`) and a signed
`app-release-signed.aab` for the Play Store.

Signed APKs/AABs are only produced when these 4 secrets exist in the repo:

- `ANDROID_KEYSTORE_BASE64` — release keystore, base64
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Without the secrets, the workflow only produces a debug APK.

## Structure

- `src/app/` — Expo Router: `welcome`, `alerts`, `app-detail`,
  `package-detail`, and the `(tabs)/index` (Home),
  `(tabs)/statistik` (Statistics), `(tabs)/aplikasi` (Apps),
  `(tabs)/pengaturan` (Settings) tabs.
- `src/components/` — UI cards and components (quota card, charts,
  app lists, tab bar, header).
- `src/lib/` — logic: `quota` (remaining/forecast/status),
  `usageStats` (native-module bridge), `dailyBuckets` (daily history),
  `summarySnapshots` (stored-number snapshots), `settings`/`storage`
  (settings), `notify` + `notificationTask` (background alerts),
  `format`, `windows`, `appIcons`, `appUsage`, `db` (SQLite local DB —
  the single storage backend, one-time migration from AsyncStorage).
- `src/theme/` — design tokens (colors, typography, radius, spacing).
- `modules/usage-stats/` — local native module (Expo Modules API,
  Android only): reads `NetworkStatsManager` (device totals + per-UID
  per-app).
- `plugins/` — Expo config plugins: `PACKAGE_USAGE_STATS` permission,
  bundle-in-debug, minify + R8 keep rules (Room/WorkManager),
  ABI splits.

## Implementation notes

- Per-app: `querySummary()` per UID, mapped to package names via
  `PackageManager.getPackagesForUid()`. Shared UIDs (e.g. Google
  services) can merge several packages — per-app numbers are the best
  estimate Android allows, not a forensic audit.
- `subscriberId: null` is used for mobile — applies to the default
  subscription.
- `NetworkStatsManager` numbers are counted since boot / system stats
  reset, not since the package was bought — that is why the package
  card uses a "since package start" window.
- Install commands: use `npx expo install ...`, not `npm add`, so
  versions match the SDK. Peer-resolution failures on plain
  `npm install` are worked around with `npm install --legacy-peer-deps`
  (the conflict is in `react-native-worklets`, an optional peer of
  `expo-modules-core`).
- Never edit `android/` by hand — all Android customization goes
  through config plugins in `plugins/` + `app.json`.

## Contributing

Issues and PRs are welcome. For behavior changes, include evidence:
`npm test`, `npx tsc --noEmit`, and `npm run lint` output.

## License

MIT — see [LICENSE](LICENSE).
