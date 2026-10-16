export type DeviceUsage = {
  wifiBytes: number;
  mobileBytes: number;
};

export type AppUsage = {
  packageName: string;
  label: string;
  bytes: number;
};
