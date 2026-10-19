// Pembungkus expo-notifications (T4.1 + T4.2) — satu-satunya tempat
// yang menyentuh API notifikasi Expo. Modul ini HANYA lokal (tanpa
// push/FCM/APNs): tidak ada token push, tidak ada server.
// - Izin: Android 13+ memakai prompt sistem; kanal dibuat dulu supaya
//   prompt muncul (sesuai docs expo-notifications).
// - Ketuk notifikasi membuka /alerts — rute divalidasi persis, bukan
//   URL bebas dari payload.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

/** Kanal Android untuk semua notifikasi Internet Tracker. */
const CHANNEL_ID = 'kuota-tracker';

/** Data yang boleh dibawa notifikasi: hanya rute /alerts. */
export type NotificationTapData = { route: '/alerts' };

let handlerTerpasang = false;

/** Pasang handler tampil (sekali): banner + daftar, tanpa suara/badge. */
export function initNotificationHandler(): void {
  if (handlerTerpasang) return;
  handlerTerpasang = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Buat kanal Android bila belum ada (wajib sebelum prompt izin Android 13+). */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Peringatan kuota',
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    // Kanal gagal dibuat — pengiriman tetap dicoba; sistem memakai
    // kanal bawaan. Tidak pernah crash aplikasi karena kanal.
  }
}

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

/** Status izin notifikasi saat ini (tanpa meminta). */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/**
 * Minta izin notifikasi ke sistem. Mengembalikan true bila diberikan.
 * Android: kanal dibuat dulu supaya prompt sistem muncul. Bila pengguna
 * menolak permanen, sistem tidak menampilkan prompt lagi — Pengaturan
 * menampilkan teks "aktifkan di pengaturan sistem" untuk kasus itu.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await ensureChannel();
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Kirim satu notifikasi lokal SEKARANG. Mengembalikan true bila
 * benar-benar terkirim. False bila izin belum diberikan / gagal —
 * pemanggil TIDAK boleh menganggapnya terkirim (mis. jangan tandai
 * ringkasan harian sudah terkirim bila ini false).
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data: NotificationTapData = { route: '/alerts' },
): Promise<boolean> {
  try {
    initNotificationHandler();
    await ensureChannel();
    const izin = await getNotificationPermission();
    if (izin !== 'granted') return false;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Notifikasi uji dari Pengaturan — membuktikan jalur pengiriman jalan. */
export async function sendTestNotification(): Promise<boolean> {
  return sendLocalNotification(
    'Notifikasi uji Internet Tracker',
    'Jalur notifikasi jalan. Peringatan kuota akan muncul seperti ini.',
  );
}

/**
 * Dengarkan ketukan notifikasi: ketukan membuka /alerts. `onOpenAlerts`
 * dipanggil hanya bila data notifikasi membawa route '/alerts' persis —
 * payload lain diabaikan. Termasuk respons saat aplikasi dibuka dari
 * keadaan mati lewat notifikasi (getLastNotificationResponse).
 */
export function observeNotificationTaps(onOpenAlerts: () => void): () => void {
  initNotificationHandler();
  const bukaBilaAlerts = (notif: Notifications.Notification) => {
    const data = notif.request.content.data as unknown;
    if (
      typeof data === 'object' &&
      data !== null &&
      (data as { route?: unknown }).route === '/alerts'
    ) {
      onOpenAlerts();
    }
  };
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response?.notification) bukaBilaAlerts(response.notification);
    })
    .catch(() => {
      // Tidak ada respons tersimpan — bukan error.
    });
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    bukaBilaAlerts(response.notification);
  });
  return () => sub.remove();
}
