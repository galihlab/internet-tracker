import { GB } from './format';

export type Period = '24h' | '7d' | '30d';

export type AppUsage = {
  packageName: string;
  label: string;
  bytes: number;
};

export type UsageSummary = {
  wifiBytes: number;
  mobileBytes: number;
  totalBytes: number;
  periodStart: number;
  periodEnd: number;
  perApp: AppUsage[];
  /** 'native' = angka asli dari NetworkStatsManager, 'sample' = data contoh (Expo Go) */
  source: 'native' | 'sample';
};

// Tipe modul native (dari modules/usage-stats). Import type-only: tidak ada
// side effect di runtime, jadi aman di Expo Go. Default export-nya adalah
// instance modul, jadi tipenya diambil lewat `typeof`.
import type UsageStatsModuleInstance from '../../modules/usage-stats';

type UsageStatsModuleType = typeof UsageStatsModuleInstance;

let nativePromise: Promise<UsageStatsModuleType | null> | null = null;

/**
 * Muat modul native secara lazy. Di Expo Go / web, requireNativeModule
 * melempar karena modul tidak ter-link -> null -> pemakaian data contoh.
 */
function loadNative(): Promise<UsageStatsModuleType | null> {
  if (!nativePromise) {
    nativePromise = import('../../modules/usage-stats')
      .then((m) => {
        const mod = m.default as unknown as UsageStatsModuleType | undefined;
        return mod && typeof mod.getDeviceUsage === 'function' ? mod : null;
      })
      .catch(() => null);
  }
  return nativePromise;
}

export function periodToRange(period: Period, now = Date.now()): { start: number; end: number } {
  const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
  return { start: now - days * 24 * 60 * 60 * 1000, end: now };
}

export function periodLabel(period: Period): string {
  return period === '24h'
    ? '24 jam terakhir'
    : period === '7d'
      ? '7 hari terakhir'
      : '30 hari terakhir';
}

/** data contoh, dipakai hanya saat modul native tidak tersedia. jelas dilabeli di UI. */
function sampleSummary(start: number, end: number): UsageSummary {
  const days = Math.max(0.05, (end - start) / (24 * 60 * 60 * 1000));
  const mobileBytes = 6.0 * GB * days;
  const wifiBytes = 0;
  const perApp: AppUsage[] = [
    { packageName: 'com.zhiliaoapp.musically', label: 'TikTok', bytes: 3.9 * GB * days },
    { packageName: 'com.google.android.youtube', label: 'YouTube', bytes: 1.1 * GB * days },
    { packageName: 'com.android.chrome', label: 'Chrome', bytes: 0.5 * GB * days },
    { packageName: 'com.android.vending', label: 'Play Store', bytes: 0.2 * GB * days },
    { packageName: 'com.whatsapp', label: 'WhatsApp', bytes: 0.15 * GB * days },
    { packageName: 'lainnya', label: 'Lainnya', bytes: 0.15 * GB * days },
  ];
  return {
    wifiBytes,
    mobileBytes,
    totalBytes: wifiBytes + mobileBytes,
    periodStart: start,
    periodEnd: end,
    perApp,
    source: 'sample',
  };
}

export async function getUsageSummaryForRange(
  start: number,
  end: number,
): Promise<UsageSummary> {
  const mod = await loadNative();
  if (mod) {
    try {
      const device = await mod.getDeviceUsage(start, end);
      const perApp = await mod.getAppUsage(start, end, 10);
      return {
        wifiBytes: device.wifiBytes,
        mobileBytes: device.mobileBytes,
        totalBytes: device.wifiBytes + device.mobileBytes,
        periodStart: start,
        periodEnd: end,
        perApp,
        source: 'native',
      };
    } catch {
      // gagal baca native (misal izin belum diberi) -> data contoh
    }
  }
  return sampleSummary(start, end);
}

export async function getUsageSummary(period: Period): Promise<UsageSummary> {
  const { start, end } = periodToRange(period);
  return getUsageSummaryForRange(start, end);
}

export async function getNativeStatus(): Promise<{ available: boolean; granted: boolean }> {
  const mod = await loadNative();
  if (!mod) return { available: false, granted: false };
  try {
    return { available: true, granted: await mod.hasUsageAccess() };
  } catch {
    return { available: true, granted: false };
  }
}

export function openUsageAccessSettings(): void {
  void loadNative().then((mod) => mod?.openUsageAccessSettings());
}
