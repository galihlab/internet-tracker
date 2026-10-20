import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import PackageHistoryList from '../../components/PackageHistoryList';
import ScreenEnter from '../../components/ScreenEnter';
import { formatCapWaktu, formatDateID, formatGB, GB } from '../../lib/format';
import { computeQuota, operatorLabel, packageLastDay } from '../../lib/quota';
import { useSettings } from '../../lib/settings';
import { useUsage } from '../../lib/usage';
import { openUsageAccessSettings } from '../../lib/usageStats';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  type NotificationPermission,
} from '../../lib/notify';
import { packageSignature } from '../../lib/notifications';
import { loadNotificationState, type NotificationState } from '../../lib/notificationState';
import { sqliteStore } from '../../lib/db';
import { NOTIFICATION_THRESHOLD_OPTIONS, type PerAppBudget } from '../../lib/storage';
import { colors, layout, radius, spacing, typography } from '../../theme';

/** Batas ukuran foto profil (data URI) — foto dipangkas 1:1 kualitas 0.5. */
const MAX_FOTO_DATA_URI = 500_000;

/** Inisial dari nama: huruf awal dua kata pertama, huruf besar. */
function inisialNama(name: string): string {
  const kata = name.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return '';
  return kata
    .slice(0, 2)
    .map((k) => k.charAt(0).toUpperCase())
    .join('');
}

type ProfilDraft = {
  nama: string;
  foto: string;
};

/**
 * Seksi Profil: foto + nama dalam SATU draf, disimpan lewat tombol
 * "Simpan profil" — bukan onBlur diam-diam. `key` dari pemanggil
 * mengikuti nilai tersimpan, jadi draf ter-reset begitu simpan berhasil
 * atau pengaturan berubah dari luar.
 */
function ProfilSection({
  namaTersimpan,
  fotoTersimpan,
  onSimpan,
}: {
  namaTersimpan: string;
  fotoTersimpan: string;
  onSimpan: (draf: ProfilDraft) => Promise<void>;
}) {
  const [draf, setDraf] = useState<ProfilDraft>({ nama: namaTersimpan, foto: fotoTersimpan });
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  const kotor = draf.nama !== namaTersimpan || draf.foto !== fotoTersimpan;
  const inisial = inisialNama(draf.nama);

  const pilihFoto = async () => {
    setPesan(null);
    const izin = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (izin.status !== 'granted') {
      setPesan('Izin galeri belum diberikan — aktifkan di Pengaturan sistem bila ingin ganti foto.');
      return;
    }
    const hasil = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (hasil.canceled) return;
    const aset = hasil.assets?.[0];
    if (!aset?.base64) {
      setPesan('Gagal membaca foto — coba foto lain.');
      return;
    }
    const dataUri = `data:${aset.mimeType ?? 'image/jpeg'};base64,${aset.base64}`;
    if (dataUri.length > MAX_FOTO_DATA_URI) {
      setPesan('Foto terlalu besar — pilih foto yang lebih kecil.');
      return;
    }
    setDraf((d) => ({ ...d, foto: dataUri }));
  };

  const simpan = () => {
    setMenyimpan(true);
    setPesan(null);
    onSimpan({ nama: draf.nama.trim(), foto: draf.foto })
      .catch(() => setPesan('Gagal menyimpan profil — coba lagi.'))
      .finally(() => setMenyimpan(false));
  };

  return (
    <View style={styles.card}>
      <View style={styles.avatarRow}>
        {draf.foto ? (
          <Image source={{ uri: draf.foto }} style={styles.avatarPreview} />
        ) : (
          <View style={styles.avatarPreview}>
            <Text style={styles.avatarPreviewText}>{inisial || '?'}</Text>
          </View>
        )}
        <View style={styles.avatarActions}>
          <Pressable style={styles.button} onPress={() => void pilihFoto()} hitSlop={4}>
            <Text style={styles.buttonText}>Ubah foto</Text>
          </Pressable>
          {draf.foto ? (
            <Pressable
              style={styles.textButton}
              onPress={() => setDraf((d) => ({ ...d, foto: '' }))}
              hitSlop={4}
            >
              <Text style={styles.textButtonText}>Hapus foto</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={styles.hint}>Foto tampil sebagai avatar di Beranda. Disimpan di perangkat.</Text>

      <Text style={styles.fieldLabel}>Nama</Text>
      <TextInput
        style={styles.input}
        value={draf.nama}
        onChangeText={(v) => setDraf((d) => ({ ...d, nama: v }))}
        placeholder="Nama kamu"
        placeholderTextColor={colors.secondary}
        accessibilityLabel="Nama pengguna"
        returnKeyType="done"
        maxLength={60}
      />
      {pesan ? <Text style={styles.hint}>{pesan}</Text> : null}
      <Pressable
        style={[styles.button, !kotor && styles.buttonDisabled]}
        onPress={simpan}
        disabled={!kotor || menyimpan}
        hitSlop={4}
      >
        <Text style={styles.buttonText}>{menyimpan ? 'Menyimpan…' : 'Simpan profil'}</Text>
      </Pressable>
    </View>
  );
}

type NotifDraft = {
  notificationsEnabled: boolean;
  notificationThresholds: number[];
  dailySummaryEnabled: boolean;
  dailySummaryHour: number;
};

/**
 * Seksi Notifikasi: SEMUA opsi dalam satu draf, disimpan lewat tombol
 * "Simpan notifikasi". Izin sistem + notifikasi uji tetap tombol aksi
 * langsung (bukan pengaturan) — tidak masuk draf.
 */
function NotifikasiSection({
  tersimpan,
  onSimpan,
}: {
  tersimpan: NotifDraft;
  onSimpan: (draf: NotifDraft) => Promise<void>;
}) {
  const [draf, setDraf] = useState<NotifDraft>(tersimpan);
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [izinNotif, setIzinNotif] = useState<NotificationPermission | null>(null);
  const [hasilUji, setHasilUji] = useState<string | null>(null);
  const [tampilPilihJam, setTampilPilihJam] = useState(false);

  useEffect(() => {
    let aktif = true;
    void getNotificationPermission().then((status) => {
      if (aktif) setIzinNotif(status);
    });
    return () => {
      aktif = false;
    };
  }, []);

  const kotor = JSON.stringify(draf) !== JSON.stringify(tersimpan);
  const notifMati = !draf.notificationsEnabled;

  const simpan = () => {
    setMenyimpan(true);
    setPesan(null);
    onSimpan(draf)
      .catch(() => setPesan('Gagal menyimpan notifikasi — coba lagi.'))
      .finally(() => setMenyimpan(false));
  };

  const toggleAmbang = (nilai: number) => {
    const aktif = draf.notificationThresholds.includes(nilai);
    setDraf((d) => ({
      ...d,
      notificationThresholds: aktif
        ? d.notificationThresholds.filter((t) => t !== nilai)
        : [...d.notificationThresholds, nilai].sort((a, b) => a - b),
    }));
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

  const pilihJam = (_event: DateTimePickerEvent, selected?: Date) => {
    setTampilPilihJam(false);
    if (selected) {
      setDraf((d) => ({ ...d, dailySummaryHour: selected.getHours() }));
    }
  };

  return (
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
          value={draf.notificationsEnabled}
          onValueChange={(nilai) => setDraf((d) => ({ ...d, notificationsEnabled: nilai }))}
          trackColor={{ true: colors.sageActive, false: colors.sageLight }}
          thumbColor={draf.notificationsEnabled ? colors.primary : colors.secondary}
          accessibilityRole="switch"
          accessibilityState={{ checked: draf.notificationsEnabled }}
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
              ? 'Izin notifikasi ditolak — aktifkan di Pengaturan sistem › Aplikasi › Internet Tracker › Notifikasi.'
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
        const aktif = draf.notificationThresholds.includes(nilai);
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
          value={draf.dailySummaryEnabled}
          disabled={notifMati}
          onValueChange={(nilai) => setDraf((d) => ({ ...d, dailySummaryEnabled: nilai }))}
          trackColor={{ true: colors.sageActive, false: colors.sageLight }}
          thumbColor={draf.dailySummaryEnabled ? colors.primary : colors.secondary}
          accessibilityRole="switch"
          accessibilityState={{
            checked: draf.dailySummaryEnabled,
            disabled: notifMati,
          }}
          accessibilityLabel="Kirim ringkasan harian"
        />
      </View>
      {draf.dailySummaryEnabled && !notifMati ? (
        <>
          <Pressable
            style={styles.timeButton}
            onPress={() => setTampilPilihJam(true)}
            accessibilityRole="button"
            accessibilityLabel={`Jam ringkasan harian, saat ini pukul ${draf.dailySummaryHour}`}
          >
            <Text style={styles.timeButtonText}>
              Setiap hari pukul {String(draf.dailySummaryHour).padStart(2, '0')}:00
            </Text>
          </Pressable>
          {tampilPilihJam ? (
            <DateTimePicker
              value={new Date(new Date().setHours(draf.dailySummaryHour, 0, 0, 0))}
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

      {pesan ? <Text style={styles.hint}>{pesan}</Text> : null}
      <Pressable
        style={[styles.button, !kotor && styles.buttonDisabled]}
        onPress={simpan}
        disabled={!kotor || menyimpan}
        hitSlop={4}
      >
        <Text style={styles.buttonText}>{menyimpan ? 'Menyimpan…' : 'Simpan notifikasi'}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Seksi Pengingat internet (v1.3.0): batas harian total internet,
 * pengingat pemakaian malam, dan daftar batas per aplikasi (diatur
 * dari detail aplikasi). Batas harian + saklar malam dalam SATU draf
 * dengan tombol "Simpan pengingat"; hapus batas per aplikasi adalah
 * aksi langsung. Tidak bergantung pada paket — jalan tanpa paket aktif.
 */
function PengingatInternetSection({
  tersimpan,
  perAppBudgets,
  onSimpan,
  onHapusBatasAplikasi,
}: {
  tersimpan: { dailyInternetBudgetBytes: number; overnightAlertEnabled: boolean };
  perAppBudgets: PerAppBudget[];
  onSimpan: (draf: {
    dailyInternetBudgetBytes: number;
    overnightAlertEnabled: boolean;
  }) => Promise<void>;
  onHapusBatasAplikasi: (packageName: string) => Promise<void>;
}) {
  const [batasGB, setBatasGB] = useState(
    tersimpan.dailyInternetBudgetBytes > 0
      ? String(tersimpan.dailyInternetBudgetBytes / GB)
      : '',
  );
  const [malam, setMalam] = useState(tersimpan.overnightAlertEnabled);
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  const kotor =
    batasGB !==
      (tersimpan.dailyInternetBudgetBytes > 0
        ? String(tersimpan.dailyInternetBudgetBytes / GB)
        : '') || malam !== tersimpan.overnightAlertEnabled;

  const simpan = () => {
    const gb = batasGB.trim() === '' ? 0 : Number(batasGB.replace(',', '.'));
    if (!Number.isFinite(gb) || gb < 0) {
      setPesan('Isi batas harian dengan angka 0 ke atas (GB), atau kosongkan untuk mematikan.');
      return;
    }
    setMenyimpan(true);
    setPesan(null);
    onSimpan({ dailyInternetBudgetBytes: gb * GB, overnightAlertEnabled: malam })
      .catch(() => setPesan('Gagal menyimpan pengingat — coba lagi.'))
      .finally(() => setMenyimpan(false));
  };

  return (
    <View style={styles.card}>
      <Text style={styles.fieldLabel}>Batas harian total internet (GB)</Text>
      <Text style={styles.hint}>
        Total seluler + Wi-Fi hari ini mencapai batas ini → berbunyi sekali hari itu.
        Kosongkan untuk mematikan.
      </Text>
      <TextInput
        style={styles.input}
        value={batasGB}
        onChangeText={setBatasGB}
        placeholder="Mis. 4"
        placeholderTextColor={colors.secondary}
        keyboardType="decimal-pad"
        accessibilityLabel="Batas harian total internet dalam GB"
      />
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.fieldLabel}>Pengingat pemakaian malam</Text>
          <Text style={styles.hint}>
            Bila pemakaian 00:00–06:00 mencapai 500 MB, beri tahu pagi harinya — sekali
            per malam.
          </Text>
        </View>
        <Switch
          value={malam}
          onValueChange={setMalam}
          trackColor={{ true: colors.sageActive, false: colors.sageLight }}
          thumbColor={malam ? colors.primary : colors.secondary}
          accessibilityRole="switch"
          accessibilityState={{ checked: malam }}
          accessibilityLabel="Pengingat pemakaian malam"
        />
      </View>
      {pesan ? <Text style={styles.hint}>{pesan}</Text> : null}
      <Pressable
        style={[styles.button, !kotor && styles.buttonDisabled]}
        onPress={simpan}
        disabled={!kotor || menyimpan}
        hitSlop={4}
      >
        <Text style={styles.buttonText}>{menyimpan ? 'Menyimpan…' : 'Simpan pengingat'}</Text>
      </Pressable>

      <Text style={[styles.fieldLabel, styles.subSection]}>Batas per aplikasi</Text>
      {perAppBudgets.length === 0 ? (
        <Text style={styles.hint}>
          Belum ada batas per aplikasi. Buka detail sebuah aplikasi dari tab Aplikasi
          untuk mengatur batas hariannya.
        </Text>
      ) : (
        perAppBudgets.map((b) => (
          <View key={b.packageName} style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.fieldLabel}>{b.label}</Text>
              <Text style={styles.hint}>Batas harian {formatGB(b.budgetBytes)}</Text>
            </View>
            <Pressable
              style={styles.textButton}
              onPress={() => void onHapusBatasAplikasi(b.packageName)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`Hapus batas harian ${b.label}`}
            >
              <Text style={[styles.textButtonText, styles.deleteText]}>Hapus</Text>
            </Pressable>
          </View>
        ))
      )}
      <Text style={styles.hint}>
        Pengingat diperiksa tiap aplikasi dibuka dan lewat tugas latar (maksimal tiap
        60 menit) — bisa telat sampai sejam.
      </Text>
    </View>
  );
}

/**
 * Status ambang paket berjalan: ambang mana yang sudah berbunyi, mana
 * yang belum tercapai — supaya tidak ada lagi "gatau notif persenannya".
 */
function StatusAmbang() {
  const { settings } = useSettings();
  const { quotaSummary, buckets } = useUsage();
  const [state, setState] = useState<NotificationState | null>(null);

  useEffect(() => {
    let aktif = true;
    void loadNotificationState(sqliteStore).then((s) => {
      if (aktif) setState(s);
    });
    return () => {
      aktif = false;
    };
  }, []);

  if (!state) {
    return (
      <View style={styles.card}>
        <Text style={styles.hint}>Memuat status ambang…</Text>
      </View>
    );
  }

  const pkg = settings.pkg;
  // Tanpa paket aktif, tidak ada ambang kuota yang berlaku — tapi
  // tanggal ringkasan harian terakhir tetap ditampilkan.
  if (pkg !== null && !quotaSummary) {
    return (
      <View style={styles.card}>
        <Text style={styles.hint}>Memuat status ambang…</Text>
      </View>
    );
  }
  const terpakai =
    pkg !== null && quotaSummary
      ? computeQuota(pkg, quotaSummary.mobileBytes, new Date(), buckets)
      : null;
  const signature = pkg !== null ? packageSignature(pkg) : null;

  return (
    <View style={styles.card}>
      {pkg === null || terpakai === null || signature === null ? (
        <Text style={styles.hint}>
          Tidak ada paket aktif — peringatan ambang kuota tidak berlaku.
        </Text>
      ) : (
        NOTIFICATION_THRESHOLD_OPTIONS.map((nilai) => {
          const sudah = state.firedIds.includes(`${signature}:ambang:${nilai}`);
          const aktif = settings.notificationThresholds.includes(nilai);
          const tercapai = terpakai.usedPercent >= nilai;
          const status = sudah
            ? 'Sudah berbunyi ✓'
            : !aktif
              ? 'Nonaktif di Pengaturan'
              : tercapai
                ? 'Tercapai — berbunyi pada pemeriksaan berikutnya'
                : `Belum tercapai (terpakai ${Math.round(terpakai.usedPercent)}%)`;
          return (
            <View key={nilai} style={styles.statusRow}>
              <Text style={styles.fieldLabel}>Kuota terpakai {nilai}%</Text>
              <Text style={styles.statusValue}>{status}</Text>
            </View>
          );
        })
      )}
      <Text style={styles.hint}>
        {state.lastDailySummaryDateISO
          ? `Ringkasan harian terakhir terkirim ${formatDateID(new Date(state.lastDailySummaryDateISO))}.`
          : 'Ringkasan harian belum pernah terkirim.'}
      </Text>
    </View>
  );
}

/**
 * Tab Pengaturan (T4.1 + v1.1.0) — seksi terpisah per fitur, masing-masing
 * dengan tombol Simpan sendiri: Profil (foto + nama), Paket aktif,
 * Notifikasi, Pengingat internet (v1.3.0), Status ambang, Izin akses
 * penggunaan, Lainnya.
 */
export default function PengaturanScreen() {
  const insets = useSafeAreaInsets();
  const {
    settings,
    savedAt,
    updateUserName,
    updateProfilePhoto,
    updateNotificationOptions,
    updateDailyInternetBudget,
    updateOvernightAlert,
    removePerAppBudget,
    deleteActivePackage,
    deleteHistoryEntry,
    clearHistory,
    restoreHistoryEntry,
    resetWelcomeSeen,
  } = useSettings();
  const { nativeStatus, refresh, quotaSummary } = useUsage();

  const simpanProfil = async (draf: ProfilDraft) => {
    if (draf.nama !== settings.userName) await updateUserName(draf.nama);
    if (draf.foto !== settings.profilePhoto) await updateProfilePhoto(draf.foto);
  };

  const simpanPengingat = async (draf: {
    dailyInternetBudgetBytes: number;
    overnightAlertEnabled: boolean;
  }) => {
    if (draf.dailyInternetBudgetBytes !== settings.dailyInternetBudgetBytes) {
      await updateDailyInternetBudget(draf.dailyInternetBudgetBytes);
    }
    if (draf.overnightAlertEnabled !== settings.overnightAlertEnabled) {
      await updateOvernightAlert(draf.overnightAlertEnabled);
    }
  };

  const hapusPaketAktif = () => {
    Alert.alert(
      'Hapus paket aktif?',
      'Paket aktif akan diarsipkan ke riwayat dan tidak ada lagi paket aktif sampai kamu menambah yang baru. Peringatan ambang kuota ikut berhenti.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus paket',
          style: 'destructive',
          onPress: () => void deleteActivePackage(),
        },
      ],
    );
  };

  const hapusEntriRiwayat = (key: string) => {
    Alert.alert('Hapus riwayat paket ini?', 'Entri riwayat ini akan hilang selamanya.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => void deleteHistoryEntry(key),
      },
    ]);
  };

  const hapusSemuaRiwayat = () => {
    Alert.alert(
      'Hapus semua riwayat paket?',
      'Seluruh riwayat paket akan hilang selamanya. Paket aktif tidak ikut terhapus.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus semua',
          style: 'destructive',
          onPress: () => void clearHistory(),
        },
      ],
    );
  };

  const pkg = settings.pkg;
  const akhir = pkg !== null ? packageLastDay(pkg) : null;

  return (
    <ScreenEnter>
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + layout.contentBottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Pengaturan</Text>
        {savedAt !== null ? (
          <Text style={styles.savedNote}>Tersimpan ✓ · {formatCapWaktu(savedAt)}</Text>
        ) : null}

        <Text style={styles.sectionTitle}>Profil</Text>
        <ProfilSection
          key={`${settings.userName}|${settings.profilePhoto}`}
          namaTersimpan={settings.userName}
          fotoTersimpan={settings.profilePhoto}
          onSimpan={simpanProfil}
        />

        <Text style={styles.sectionTitle}>Paket aktif</Text>
        {pkg !== null && akhir !== null ? (
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
            <Pressable style={styles.textButton} onPress={hapusPaketAktif} hitSlop={4}>
              <Text style={[styles.textButtonText, styles.deleteText]}>Hapus paket</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Belum ada paket aktif.</Text>
            <Text style={styles.hint}>
              Tambah paket untuk melihat sisa kuota dan prediksi habis di Beranda.
            </Text>
            <Pressable
              style={styles.button}
              onPress={() => router.push('/package-detail')}
              hitSlop={4}
            >
              <Text style={styles.buttonText}>Tambah paket</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>Riwayat paket</Text>
        <PackageHistoryList
          history={settings.history}
          onDelete={hapusEntriRiwayat}
          onRestore={(key) => void restoreHistoryEntry(key)}
        />
        {settings.history.length > 0 ? (
          <Pressable style={styles.textButton} onPress={hapusSemuaRiwayat} hitSlop={4}>
            <Text style={[styles.textButtonText, styles.deleteText]}>
              Hapus semua riwayat
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionTitle}>Notifikasi</Text>
        <NotifikasiSection
          key={JSON.stringify({
            notificationsEnabled: settings.notificationsEnabled,
            notificationThresholds: settings.notificationThresholds,
            dailySummaryEnabled: settings.dailySummaryEnabled,
            dailySummaryHour: settings.dailySummaryHour,
          })}
          tersimpan={{
            notificationsEnabled: settings.notificationsEnabled,
            notificationThresholds: settings.notificationThresholds,
            dailySummaryEnabled: settings.dailySummaryEnabled,
            dailySummaryHour: settings.dailySummaryHour,
          }}
          onSimpan={updateNotificationOptions}
        />

        <Text style={styles.sectionTitle}>Pengingat internet</Text>
        <PengingatInternetSection
          key={`${settings.dailyInternetBudgetBytes}|${settings.overnightAlertEnabled}|${settings.perAppBudgets.map((b) => `${b.packageName}:${b.budgetBytes}`).join(',')}`}
          tersimpan={{
            dailyInternetBudgetBytes: settings.dailyInternetBudgetBytes,
            overnightAlertEnabled: settings.overnightAlertEnabled,
          }}
          perAppBudgets={settings.perAppBudgets}
          onSimpan={simpanPengingat}
          onHapusBatasAplikasi={removePerAppBudget}
        />

        <Text style={styles.sectionTitle}>Status ambang</Text>
        <StatusAmbang />

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
            onPress={() => void resetWelcomeSeen()}
            hitSlop={4}
          >
            <Text style={styles.textButtonText}>Lihat layar welcome lagi</Text>
          </Pressable>
          <Text style={styles.version}>
            Internet Tracker · versi {Constants.expoConfig?.version ?? '—'}
          </Text>
        </View>
      </ScrollView>
    </View>
    </ScreenEnter>
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
    marginBottom: spacing.xs,
  },
  savedNote: {
    ...typography.caption,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.ink,
    marginTop: spacing.xl,
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
  buttonDisabled: {
    opacity: 0.5,
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
  deleteText: {
    color: colors.critical,
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
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatarPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.sageActive,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPreviewText: {
    ...typography.heading,
    color: colors.primary,
  },
  avatarActions: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusValue: {
    ...typography.body,
    color: colors.secondary,
    textAlign: 'right',
    flex: 1,
  },
});
