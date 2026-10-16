import { NativeModule, requireNativeModule } from 'expo';
import type { AppUsage, DeviceUsage } from './UsageStats.types';

declare class UsageStatsModule extends NativeModule<{}> {
  hasUsageAccess(): Promise<boolean>;
  openUsageAccessSettings(): void;
  getDeviceUsage(start: number, end: number): Promise<DeviceUsage>;
  getAppUsage(start: number, end: number, limit: number): Promise<AppUsage[]>;
}

export default requireNativeModule<UsageStatsModule>('UsageStats');
