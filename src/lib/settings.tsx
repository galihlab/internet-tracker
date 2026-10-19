import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { sqliteStore } from './db';
import { defaultSettings, loadSettings, saveSettings, type StoredSettings } from './storage';
import { resetNotificationState } from './notificationState';
import type { QuotaPackage } from './quota';

type SettingsContextValue = {
  /** Pengaturan aktif. Nilai awal = bawaan, diganti yang tersimpan begitu termuat. */
  settings: StoredSettings;
  /** True setelah pengaturan tersimpan selesai dimuat. */
  loaded: boolean;
  /**
   * Waktu simpan terakhir (epoch ms) di sesi ini, null bila belum ada
   * simpan. Pengaturan menampilkan "Tersimpan ✓" dari nilai ini —
   * simpan harus TERLIHAT, bukan diam-diam.
   */
  savedAt: number | null;
  /** Simpan paket baru (dipakai Beranda dan detail paket). */
  updatePackage: (pkg: QuotaPackage) => Promise<void>;
  /**
   * Mulai paket baru (T2.7): paket aktif saat ini diarsipkan ke riwayat,
   * lalu paket baru menjadi aktif. Menyimpan paket baru TIDAK menggeser
   * tanggal mulai ke hari ini — tanggal mulai dari form dipakai apa adanya.
   */
  startNewPackage: (pkg: QuotaPackage) => Promise<void>;
  /** Simpan nama pengguna (dipakai Pengaturan). */
  updateUserName: (userName: string) => Promise<void>;
  /** Simpan foto profil (data URI JPEG base64, '' = hapus; dipakai Pengaturan). */
  updateProfilePhoto: (profilePhoto: string) => Promise<void>;
  /**
   * Simpan opsi notifikasi (dipakai Pengaturan): master on/off, daftar
   * ambang aktif, ringkasan harian on/off + jamnya. Satu pemanggil
   * untuk semua — Pengaturan tidak pernah menulis blob parsial.
   */
  updateNotificationOptions: (
    opsi: Partial<
      Pick<
        StoredSettings,
        | 'notificationsEnabled'
        | 'notificationThresholds'
        | 'dailySummaryEnabled'
        | 'dailySummaryHour'
      >
    >,
  ) => Promise<void>;
  /** Tandai welcome sudah diselesaikan. */
  markWelcomeSeen: () => Promise<void>;
  /** Kembalikan welcomeSeen ke false supaya welcome tampil lagi (dipakai tombol "Lihat layar welcome lagi"). */
  resetWelcomeSeen: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoredSettings>(() => defaultSettings());
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let aktif = true;
    void loadSettings().then((tersimpan) => {
      if (aktif) {
        setSettings(tersimpan);
        setLoaded(true);
      }
    });
    return () => {
      aktif = false;
    };
  }, []);

  // Simpan dulu, baru ubah state: jika penyimpanan gagal, state lama
  // tetap berlaku dan pemanggil bisa menangani error-nya.
  const patch = useCallback(
    async (bagian: Partial<StoredSettings>) => {
      const berikutnya = { ...settings, ...bagian };
      await saveSettings(berikutnya);
      setSettings(berikutnya);
      setSavedAt(Date.now());
    },
    [settings],
  );

  const updatePackage = useCallback(
    (pkg: QuotaPackage) => patch({ pkg }),
    [patch],
  );
  const startNewPackage = useCallback(
    async (pkg: QuotaPackage) => {
      // Paket baru = siklus notifikasi baru: ambang yang sudah berbunyi
      // pada paket lama tidak boleh menghalangi bunyi pada paket baru
      // (T4.2: setiap ambang hanya berbunyi sekali PER PAKET).
      await resetNotificationState(sqliteStore);
      await patch({
        pkg,
        history: [{ ...settings.pkg, archivedAt: Date.now() }, ...settings.history],
      });
    },
    [patch, settings],
  );
  const updateUserName = useCallback(
    (userName: string) => patch({ userName }),
    [patch],
  );
  const updateProfilePhoto = useCallback(
    (profilePhoto: string) => patch({ profilePhoto }),
    [patch],
  );
  const updateNotificationOptions = useCallback(
    (
      opsi: Partial<
        Pick<
          StoredSettings,
          | 'notificationsEnabled'
          | 'notificationThresholds'
          | 'dailySummaryEnabled'
          | 'dailySummaryHour'
        >
      >,
    ) => patch(opsi),
    [patch],
  );
  const markWelcomeSeen = useCallback(() => patch({ welcomeSeen: true }), [patch]);
  const resetWelcomeSeen = useCallback(() => patch({ welcomeSeen: false }), [patch]);

  const value = useMemo(
    () => ({
      settings,
      loaded,
      savedAt,
      updatePackage,
      startNewPackage,
      updateUserName,
      updateProfilePhoto,
      updateNotificationOptions,
      markWelcomeSeen,
      resetWelcomeSeen,
    }),
    [
      settings,
      loaded,
      savedAt,
      updatePackage,
      startNewPackage,
      updateUserName,
      updateProfilePhoto,
      updateNotificationOptions,
      markWelcomeSeen,
      resetWelcomeSeen,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Ambil pengaturan. Harus dipakai di dalam `SettingsProvider`. */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings harus dipakai di dalam SettingsProvider');
  }
  return ctx;
}
