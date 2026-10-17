import { Component, useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useAppFonts } from '../theme/fonts';
import { SettingsProvider, useSettings } from '../lib/settings';
import { UsageProvider } from '../lib/usage';
import { observeNotificationTaps } from '../lib/notify';
import { syncNotificationTask } from '../lib/notificationTask';
import {
  getCapturedError,
  installCrashCapture,
  subscribeCrashCapture,
  toCapturedError,
  type CapturedError,
} from '../lib/crashCapture';

// DIAGNOSTIK SEMENTARA (v1.0.0-diag1): pasang penangkap error global.
// HAPUS bersama CrashBoundary/CrashScreen setelah diagnosis selesai.
installCrashCapture();

/**
 * DIAGNOSTIK SEMENTARA (v1.0.0-diag1): layar error yang menampilkan
 * pesan + stack error yang tertangkap, supaya bisa di-screenshot.
 * Splash native disembunyikan saat layar ini tampil — kalau tidak,
 * splash menutupi layar error dan app tampak nyangkut di splash.
 */
function CrashScreen({ error }: { error: CapturedError }) {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {
      // Splash sudah tersembunyi — lanjut saja.
    });
  }, []);

  return (
    <ScrollView style={styles.crashLatar}>
      <Text style={styles.crashJudul}>DIAGNOSTIK — ERROR TERTANGKAP</Text>
      <Text style={styles.crashTeks} selectable>
        {error.message}
      </Text>
      <Text style={styles.crashMeta} selectable>
        fatal: {error.fatal ? 'ya' : 'tidak'} · {new Date(error.at).toISOString()}
      </Text>
      <Text style={styles.crashTeks} selectable>
        {error.stack}
      </Text>
      <Text style={styles.crashMeta}>Screenshot layar ini dan kirim ke Aurelia.</Text>
    </ScrollView>
  );
}

/**
 * DIAGNOSTIK SEMENTARA (v1.0.0-diag1): ErrorBoundary root. Menangkap
 * error render / effect React (yang tidak ditangkap handler global) dan
 * menampilkan CrashScreen. Juga berlangganan simpanan handler global
 * untuk error yang lolos dari React.
 */
class CrashBoundary extends Component<{ children: ReactNode }, { error: CapturedError | null }> {
  state: { error: CapturedError | null } = { error: getCapturedError() };

  private lepas?: () => void;

  static getDerivedStateFromError(error: unknown): { error: CapturedError } {
    return { error: toCapturedError(error, true) };
  }

  componentDidMount(): void {
    this.lepas = subscribeCrashCapture(() => {
      const error = getCapturedError();
      if (error) {
        this.setState({ error });
      }
    });
  }

  componentWillUnmount(): void {
    this.lepas?.();
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return <CrashScreen error={error} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  crashLatar: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 20,
    paddingTop: 64,
  },
  crashJudul: {
    fontSize: 18,
    fontWeight: '700',
    color: '#b91c1c',
    marginBottom: 16,
  },
  crashTeks: {
    fontSize: 13,
    color: '#111827',
    marginBottom: 12,
    lineHeight: 18,
  },
  crashMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
});

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
  return (
    <CrashBoundary>
      <RootLayoutInner />
    </CrashBoundary>
  );
}

function RootLayoutInner() {
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
