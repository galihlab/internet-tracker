import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import PackageHistoryList from '../../components/PackageHistoryList';
import { formatDateID, formatGB } from '../../lib/format';
import { operatorLabel, packageLastDay } from '../../lib/quota';
import { useSettings } from '../../lib/settings';
import { useUsage } from '../../lib/usage';
import { openUsageAccessSettings } from '../../lib/usageStats';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  type NotificationPermission,
} from '../../lib/notify';
import { NOTIFICATION_THRESHOLD_OPTIONS } from '../../lib/storage';
import { colors, layout, radius, spacing, typography } from '../../theme';

/**
 * Tab Pengaturan (T4.1) — semua kontrol di sini berfungsi: nama
 * tersimpan, paket aktif menuju detail/edit paket, opsi notifikasi
 * tersimpan (master, ambang 50/80/100, ringkasan harian + jamnya),
 * status izin akses penggunaan dicek ulang, dan welcome bisa dibuka
 * lagi. Ambang di sini adalah nilai tersimpan yang dipakai mesin
 * notifikasi T4.2 — mematikan satu ambang mematikan peringatan ambang
 * itu (tetapi bukan peringatan lonjakan, yang sumbernya bukan ambang).
 */
export default function PengaturanScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateUserName, updateNotificationOptions, resetWelcomeSeen } =
    useSettings();
  const { nativeStatus, refresh, quotaSummary } = useUsage();
  const [nama, setNama] = useState(settings.userName);
  const [menyimpanNama, setMenyimpanNama] = useState(false);
  const [izinNotif, setIzinNotif] = useState<NotificationPermission | null>(null);
  const [hasilUji, setHasilUji] = useState<string | null>(null);
  const [tampilPilihJam, setTampilPilihJam] = useState(false);

  // Status izin notifikasi dibaca saat layar tampil — tanpa meminta.
  useEffect(() => {
    let aktif = true;
    void getNotificationPermission().then((status) => {
      if (aktif) setIzinNotif(status);
    });
    return () => {
      aktif = false;
    };
  }, []);

  const simpanNama = () => {
    const bersih = nama.trim();
    if (bersih === settings.userName) return;
    setMenyimpanNama(true);
    updateUserName(bersih)
      .catch(() => {
        // Gagal simpan — nilai layar dikembalikan ke yang tersimpan.
        setNama(settings.userName);
      })
      .finally(() => setMenyimpanNama(false));
  };

  const mintaIzinNotif = () => {
    void requestNotificationPermission().then((diberikan) => {
      setIzinNotif(diberikan ? 'granted' : 'denied');
      if (!diberikan) {
        setHasilUji('Izin notifikasi tidak diberikan — peringatan hanya tampil di daftar dalam aplikasi.');
      }
    });
  };

  const kirimUji = () => {
    setHasilUji(null);
    void sendTestNotification().then((terkirim) => {
      setHasilUji(
        terkirim
          ? 'Notifikasi uji terkirim — periksa bilah notifikasi perangkat.'
          : 'Belum terkirim — izin notifikasi belum diberikan.',
      );
      void getNotificationPermission().then(setIzinNotif);
    });
  };

  const toggleAmbang = (nilai: number) => {
    const aktif = settings.notificationThresholds.includes(nilai);
    const berikutnya = aktif
      ? settings.notificationThresholds.filter((t) => t !== nilai)
      : [...settings.notificationThresholds, nilai].sort((a, b) => a - b);
    void updateNotificationOptions({ notificationThresholds: berikutnya });
  };

  const pilihJam = (_event: DateTimePickerEvent, selected?: Date) => {
    setTampilPilihJam(false);
    if (selected) {
      void updateNotificationOptions({ dailySummaryHour: selected.getHours() });
    }
  };

  const pkg = settings.pkg;
  const akhir = packageLastDay(pkg);
  const notifMati = !settings.notificationsEnabled;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + layout.contentBottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Pengaturan</Text>

        <Text style={styles.sectionTitle}>Profil</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Nama</Text>
          <TextInput
            // `key` mengikuti nama tersimpan: bila nilai tersimpan berubah
            // (mis. selesai dimuat dari penyimpanan setelah layar tampil),
            // input dipasang ulang dengan nilai yang benar — tanpa
            // setState di dalam effect.
            key={settings.userName}
            style={styles.input}
            value={nama}
            onChangeText={setNama}
            onBlur={simpanNama}
            onSubmitEditing={simpanNama}
            placeholder="Nama kamu"
            placeholderTextColor={colors.secondary}
            accessibilityLabel="Nama pengguna"
            returnKeyType="done"
            maxLength={60}
          />
          <Text style={styles.hint}>
            {menyimpanNama ? 'Menyimpan…' : 'Nama tersimpan di perangkat.'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Paket aktif</Text>
        <View style={styles.card}>
          <Text style={styles.packageName}>{pkg.name}</Text>
          <Text style={styles.packageBig}>{formatGB(pkg.quotaBytes)}</Text>
          <Text style={styles.packageRow}>
            {operatorLabel(pkg)} · Mulai {formatDateID(new Date(pkg.startDate))} ·{' '}
            {pkg.durationDays} hari · berakhir {formatDateID(akhir)}
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => router.push('/package-detail')}
            hitSlop={4}
          >
            <Text style={styles.buttonText}>Lihat / ubah paket</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Riwayat paket</Text>
        <PackageHistoryList history={settings.history} />

        <Text style={styles.sectionTitle}>Notifikasi</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.fieldLabel}>Notifikasi kuota</Text>
              <Text style={styles.hint}>
                Mematikan ini menonaktifkan peringatan ambang, pengingat prediksi kritis,
                dan ringkasan harian. Peringatan lonjakan pemakaian tetap tercatat di
                daftar dalam aplikasi.
              </Text>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(nilai) =>
                void updateNotificationOptions({ notificationsEnabled: nilai })
              }
              trackColor={{ true: colors.sageActive, false: colors.sageLight }}
              thumbColor={settings.notificationsEnabled ? colors.primary : colors.secondary}
              accessibilityRole="switch"
              accessibilityState={{ checked: settings.notificationsEnabled }}
              accessibilityLabel="Notifikasi kuota"
            />
          </View>

          <Text style={[styles.fieldLabel, styles.subSection]}>Izin notifikasi sistem</Text>
          <Text style={styles.hint}>
            {izinNotif === null
              ? 'Memeriksa status izin…'
              : izinNotif === 'granted'
                ? 'Izin notifikasi sudah diberikan — peringatan tampil di bilah notifikasi.'
                : izinNotif === 'denied'
                  ? 'Izin notifikasi ditolak — aktifkan di Pengaturan sistem › Aplikasi › Kuota Tracker › Notifikasi.'
                  : 'Izin notifikasi belum diminta — peringatan hanya tampil di daftar dalam aplikasi sampai izin diberikan.'}
          </Text>
          {izinNotif !== 'granted' ? (
            <Pressable style={styles.button} onPress={mintaIzinNotif} hitSlop={4}>
              <Text style={styles.buttonText}>Izinkan notifikasi</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.textButton} onPress={kirimUji} hitSlop={4}>
            <Text style={styles.textButtonText}>Kirim notifikasi uji</Text>
          </Pressable>
          {hasilUji ? <Text style={styles.hint}>{hasilUji}</Text> : null}

          <Text style={[styles.fieldLabel, styles.subSection]}>Ambang peringatan</Text>
          <Text style={styles.hint}>
            Setiap ambang berbunyi tepat sekali per paket begitu kuota terpakai mencapainya.
          </Text>
          {NOTIFICATION_THRESHOLD_OPTIONS.map((nilai) => {
            const aktif = settings.notificationThresholds.includes(nilai);
            return (
              <View key={nilai} style={styles.switchRow}>
                <Text style={styles.fieldLabel}>Kuota terpakai {nilai}%</Text>
                <Switch
                  value={aktif}
                  disabled={notifMati}
                  onValueChange={() => toggleAmbang(nilai)}
                  trackColor={{ true: colors.sageActive, false: colors.sageLight }}
                  thumbColor={aktif ? colors.primary : colors.secondary}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: aktif, disabled: notifMati }}
                  accessibilityLabel={`Peringatan saat kuota terpakai ${nilai} persen`}
                />
              </View>
            );
          })}

          <Text style={[styles.fieldLabel, styles.subSection]}>Ringkasan harian</Text>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Kirim ringkasan setiap hari</Text>
            <Switch
              value={settings.dailySummaryEnabled}
              disabled={notifMati}
              onValueChange={(nilai) =>
                void updateNotificationOptions({ dailySummaryEnabled: nilai })
              }
              trackColor={{ true: colors.sageActive, false: colors.sageLight }}
              thumbColor={settings.dailySummaryEnabled ? colors.primary : colors.secondary}
              accessibilityRole="switch"
              accessibilityState={{
                checked: settings.dailySummaryEnabled,
                disabled: notifMati,
              }}
              accessibilityLabel="Kirim ringkasan harian"
            />
          </View>
          {settings.dailySummaryEnabled && !notifMati ? (
            <>
              <Pressable
                style={styles.timeButton}
                onPress={() => setTampilPilihJam(true)}
                accessibilityRole="button"
                accessibilityLabel={`Jam ringkasan harian, saat ini pukul ${settings.dailySummaryHour}`}
              >
                <Text style={styles.timeButtonText}>
                  Setiap hari pukul {String(settings.dailySummaryHour).padStart(2, '0')}:00
                </Text>
              </Pressable>
              {tampilPilihJam ? (
                <DateTimePicker
                  value={new Date(new Date().setHours(settings.dailySummaryHour, 0, 0, 0))}
                  mode="time"
                  onChange={pilihJam}
                />
              ) : null}
            </>
          ) : null}
          <Text style={styles.hint}>
            Pemeriksaan berkala di latar berjalan lewat tugas terjadwal sistem. Penghemat
            baterai, mode Doze, dan pembatasan vendor dapat menunda atau melewatkan
            pemeriksaan latar — peringatan ambang tetap diperiksa setiap kali aplikasi
            dibuka.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Izin akses penggunaan</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>
            {!nativeStatus.available
              ? 'Modul native tidak tersedia di lingkungan ini — angka memakai data contoh.'
              : nativeStatus.granted
                ? 'Izin akses penggunaan sudah diberikan — angka memakai data asli perangkat.'
                : quotaSummary?.fromSnapshot
                  ? 'Izin akses penggunaan belum diberikan — angka memakai data terakhir yang tersimpan.'
                  : 'Izin akses penggunaan belum diberikan — belum ada data tersimpan.'}
          </Text>
          <Pressable style={styles.button} onPress={openUsageAccessSettings} hitSlop={4}>
            <Text style={styles.buttonText}>Buka pengaturan izin</Text>
          </Pressable>
          <Pressable style={styles.textButton} onPress={() => void refresh()} hitSlop={4}>
            <Text style={styles.textButtonText}>Periksa ulang status izin</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Lainnya</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.textButton}
            // Mereset welcomeSeen saja sudah cukup: RootNavigator di
            // _layout mengarahkan ke /welcome begitu welcomeSeen false.
            onPress={() => void resetWelcomeSeen()}
            hitSlop={4}
          >
            <Text style={styles.textButtonText}>Lihat layar welcome lagi</Text>
          </Pressable>
          <Text style={styles.version}>
            Kuota Tracker · versi {Constants.expoConfig?.version ?? '—'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  fieldLabel: {
    ...typography.body,
    color: colors.ink,
  },
  input: {
    ...typography.body,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.sageLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
  packageName: {
    ...typography.heading,
    color: colors.ink,
  },
  packageBig: {
    ...typography.bigNumber,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  packageRow: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonText: {
    ...typography.label,
    color: colors.onPrimary,
  },
  textButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  textButtonText: {
    ...typography.label,
    color: colors.primary,
  },
  version: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.lg,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  switchText: {
    flex: 1,
  },
  subSection: {
    marginTop: spacing.xl,
  },
  timeButton: {
    borderWidth: 1,
    borderColor: colors.sageLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  timeButtonText: {
    ...typography.body,
    color: colors.ink,
  },
});
