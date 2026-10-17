// Tugas latar notifikasi (T4.2) — pemeriksaan berkala lewat
// expo-background-task (WorkManager di Android, BGTaskScheduler di
// iOS) + expo-task-manager.
//
// - `defineTask` HARUS di lingkup modul (bukan di komponen), supaya
//   tugas terdefinisi juga saat JS bundle dijalankan headless oleh
//   sistem tanpa UI terpasang.
// - Interval: 60 menit (minimum sistem 15 menit; sistem boleh
//   menunda lebih lama demi baterai — dinyatakan apa adanya di
//   Pengaturan). Pemeriksaan utama tetap saat aplikasi dibuka.
// - Pendaftaran dibatalkan saat notifikasi dimatikan di Pengaturan
//   (sinkronisasi di _layout), supaya tugas tidak jalan percuma.

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runBackgroundNotificationCheck } from './notificationChecks';

/** Nama tugas — harus stabil antar versi, sistem mengingatnya. */
export const NOTIFICATION_TASK_NAME = 'kuota-tracker-notifikasi';

/** Interval minimum antar pemeriksaan latar, dalam menit. */
export const NOTIFICATION_TASK_INTERVAL_MINUTES = 60;

TaskManager.defineTask(NOTIFICATION_TASK_NAME, async () => {
  try {
    await runBackgroundNotificationCheck();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // Gagal (mis. penyimpanan tidak bisa dibaca) — laporkan gagal
    // supaya sistem bisa mencoba lagi nanti; tidak pernah crash.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Daftarkan tugas latar (idempotent — memanggil dua kali aman). */
export async function registerNotificationTask(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(NOTIFICATION_TASK_NAME, {
      minimumInterval: NOTIFICATION_TASK_INTERVAL_MINUTES,
    });
  } catch {
    // Pendaftaran gagal (mis. tugas latar dibatasi perangkat) —
    // pemeriksaan foreground tetap jalan; Pengaturan menyatakan
    // keterbatasan ini apa adanya.
  }
}

/** Batalkan tugas latar. */
export async function unregisterNotificationTask(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(NOTIFICATION_TASK_NAME);
  } catch {
    // Sudah tidak terdaftar / gagal — abaikan.
  }
}

/** Apakah tugas latar sedang terdaftar (untuk status di Pengaturan). */
export async function isNotificationTaskRegistered(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(NOTIFICATION_TASK_NAME);
  } catch {
    return false;
  }
}

/**
 * Samakan status pendaftaran dengan saklar master notifikasi:
 * master hidup -> tugas terdaftar; master mati -> tugas dibatalkan.
 * Dipanggil dari _layout setiap pengaturan termuat / berubah.
 */
export async function syncNotificationTask(notificationsEnabled: boolean): Promise<void> {
  if (notificationsEnabled) {
    await registerNotificationTask();
  } else {
    await unregisterNotificationTask();
  }
}
