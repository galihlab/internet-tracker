import { useEffect, type ReactNode } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useAppFonts } from '../theme/fonts';
import { SettingsProvider, useSettings } from '../lib/settings';
import { UsageProvider } from '../lib/usage';
import { observeNotificationTaps } from '../lib/notify';
import { syncNotificationTask } from '../lib/notificationTask';

// Tahan splash native sampai font DAN data awal (pengaturan tersimpan)
// termuat, supaya layar pertama tidak pernah tampil dengan font sistem
// lalu berkedip berganti font kustom, atau dengan paket bawaan lalu
// melompat ke paket tersimpan.
void SplashScreen.preventAutoHideAsync().catch(() => {
  // Splash sudah disembunyikan sistem / tidak tersedia — lanjut saja.
});

/**
 * Gerbang splash (T0.7): splash hanya disembunyikan setelah font siap
 * DAN pengaturan tersimpan selesai dimuat. Jika font gagal dimuat,
 * lanjut dengan font sistem sebagai cadangan — jangan jebak aplikasi
 * di splash.
 */
function SplashGate({ fontsReady }: { fontsReady: boolean }) {
  const { loaded: settingsLoaded } = useSettings();

  useEffect(() => {
    if (fontsReady && settingsLoaded) {
      void SplashScreen.hideAsync().catch(() => {
        // Splash sudah tersembunyi — lanjut saja.
      });
    }
  }, [fontsReady, settingsLoaded]);

  return null;
}

/**
 * Navigator akar. Setelah pengaturan tersimpan termuat: bila welcome
 * belum pernah diselesaikan, arahkan ke /welcome; bila sudah, biarkan
 * rute berjalan (tab Beranda).
 */
function RootNavigator() {
  const { settings, loaded } = useSettings();
  const segments = useSegments();
  const router = useRouter();
  const diWelcome = segments[0] === 'welcome';

  useEffect(() => {
    if (!loaded || settings.welcomeSeen || diWelcome) return;
    router.replace('/welcome');
  }, [loaded, settings.welcomeSeen, diWelcome, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

/**
 * Kabel notifikasi (T4.2): ketukan notifikasi membuka /alerts, dan
 * pendaftaran tugas latar disamakan dengan saklar master notifikasi
 * setiap pengaturan berubah. Mengimpor notificationTask di sini
 * menjalankan TaskManager.defineTask di lingkup modul — wajib supaya
 * tugas terdefinisi saat bundle dijalankan headless oleh sistem.
 */
function NotificationWiring({ children }: { children: ReactNode }) {
  const { settings, loaded } = useSettings();
  const router = useRouter();

  useEffect(() => {
    const lepas = observeNotificationTaps(() => router.push('/alerts'));
    return lepas;
  }, [router]);

  useEffect(() => {
    if (!loaded) return;
    void syncNotificationTask(settings.notificationsEnabled);
  }, [loaded, settings.notificationsEnabled]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  // Selama font belum termuat, jangan render rute apa pun: yang tampil
  // hanya splash native. Pengaturan tersimpan mulai dimuat setelah
  // font siap, lalu `SplashGate` menyembunyikan splash begitu keduanya
  // selesai.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SettingsProvider>
      <SplashGate fontsReady={fontsLoaded || !!fontError} />
      <StatusBar style="dark" />
      {/* Satu data pemakaian untuk welcome DAN keempat tab — angka di
          welcome selalu sama dengan angka di Beranda (prinsip 1). */}
      <UsageProvider>
        <NotificationWiring>
          <RootNavigator />
        </NotificationWiring>
      </UsageProvider>
    </SettingsProvider>
  );
}
