// Penyimpanan pengaturan — baca/tulis blob JSON lewat local DB
// (SQLite). Bentuk + validasi ada di settingsParse.ts (murni, teruji);
// berkas ini hanya jembatan ke penyimpanan. Tipe + API murni
// di-re-export supaya importir lama (`from './storage'`) tetap jalan.

import { sqliteStore } from './db';
import {
  defaultSettings,
  NOTIFICATION_THRESHOLD_OPTIONS,
  parseSettings,
  todayISO,
  type PerAppBudget,
  type StoredSettings,
} from './settingsParse';

// Re-export API murni supaya importir lama (`from './storage'`) tetap jalan.
export { defaultSettings, NOTIFICATION_THRESHOLD_OPTIONS, parseSettings, todayISO };
export type { PerAppBudget, StoredSettings };

const SETTINGS_KEY = '@kuota-tracker:settings:v1';

/** Muat pengaturan tersimpan (atau bawaan bila belum ada). */
export async function loadSettings(): Promise<StoredSettings> {
  try {
    const raw = await sqliteStore.getItem(SETTINGS_KEY);
    return parseSettings(raw);
  } catch {
    // Penyimpanan tidak bisa dibaca — pakai bawaan supaya aplikasi jalan.
    return defaultSettings();
  }
}

/** Simpan seluruh pengaturan. */
export async function saveSettings(settings: StoredSettings): Promise<void> {
  await sqliteStore.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
