export type DeviceUsage = {
  wifiBytes: number;
  mobileBytes: number;
};

export type AppUsage = {
  packageName: string;
  label: string;
  /** Total = mobileBytes + wifiBytes, dipertahankan untuk kompatibilitas. */
  bytes: number;
  /** Pemakaian seluler (T3.3). */
  mobileBytes: number;
  /** Pemakaian Wi-Fi (T3.3). */
  wifiBytes: number;
};

/**
 * Satu bucket harian: pemakaian perangkat pada satu hari kalender.
 * Bucket hari ini bersifat parsial (tengah malam sampai sekarang);
 * hari yang sudah lewat bersifat penuh.
 */
export type DailyBucket = {
  /** Tanggal lokal 'YYYY-MM-DD'. */
  dateISO: string;
  mobileBytes: number;
  wifiBytes: number;
};

/**
 * Satu bucket per aplikasi per hari: pemakaian satu aplikasi pada satu
 * hari kalender. Sejak T3.3 angka dipecah per jaringan: `mobileBytes` dan
 * `wifiBytes` adalah sumber kebenaran; `bytes` = jumlah keduanya,
 * dipertahankan untuk kompatibilitas pemanggil lama.
 */
export type DailyAppBucket = {
  packageName: string;
  label: string;
  /** Tanggal lokal 'YYYY-MM-DD'. */
  dateISO: string;
  bytes: number;
  mobileBytes: number;
  wifiBytes: number;
};

/** Ikon satu aplikasi dari PackageManager (T3.1). */
export type AppIconInfo = {
  packageName: string;
  label: string;
  /**
   * PNG 96x96 ter-encode Base64 (tanpa prefix data URI), atau null bila
   * ikon tidak tersedia (aplikasi tidak terpasang / ikon sistem).
   * Pemanggil menampilkan ikon generik bila null — jangan pernah
   * menggambar logo palsu aplikasi.
   */
  iconBase64: string | null;
};
