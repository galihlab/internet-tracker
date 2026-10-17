import { NativeModule, requireNativeModule } from 'expo';
import type { AppIconInfo, AppUsage, DailyAppBucket, DailyBucket, DeviceUsage } from './UsageStats.types';

declare class UsageStatsModule extends NativeModule<{}> {
  hasUsageAccess(): Promise<boolean>;
  openUsageAccessSettings(): void;
  getDeviceUsage(start: number, end: number): Promise<DeviceUsage>;
  getAppUsage(start: number, end: number, limit: number): Promise<AppUsage[]>;
  /** Bucket per hari kalender pada [start, end) — lihat T2.2. */
  getDailyBuckets(start: number, end: number): Promise<DailyBucket[]>;
  /** Bucket per aplikasi per hari pada [start, end), `limit` aplikasi teratas. */
  getDailyAppBuckets(start: number, end: number, limit: number): Promise<DailyAppBucket[]>;
  /**
   * Ikon aplikasi terpasang (T3.1): satu entri per nama paket yang
   * diminta. Entri aplikasi yang tidak terpasang mengembalikan
   * `iconBase64: null` dan label = nama paket; JS menggantinya dengan
   * label terakhir yang tercatat di cache.
   */
  getAppIcons(packageNames: string[]): Promise<AppIconInfo[]>;
}

export default requireNativeModule<UsageStatsModule>('UsageStats');
