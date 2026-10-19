import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import PackageCard from '../components/PackageCard';
import PackageHistoryList from '../components/PackageHistoryList';
import { computeQuota, type QuotaPackage } from '../lib/quota';
import { useSettings } from '../lib/settings';
import { useUsage } from '../lib/usage';
import { getUsageSummaryForRange, type UsageSummary } from '../lib/usageStats';
import { formatCapWaktu, formatDateID, GB } from '../lib/format';
import { dateISOOf, packageWindow } from '../lib/windows';
import { colors, layout, radius, spacing, typography } from '../theme';

/**
 * Form tambah paket — dipakai saat TIDAK ada paket aktif. Bidang yang
 * sama dengan editor PackageCard, tanpa status kuota / tombol arsip:
 * paket yang disimpan langsung menjadi paket aktif.
 */
function PackageCreateForm({ onSave }: { onSave: (pkg: QuotaPackage) => void }) {
  const [nama, setNama] = useState('Kuota Utama');
  const [quotaGB, setQuotaGB] = useState('13');
  const [days, setDays] = useState('5');
  const [operator, setOperator] = useState('Telkomsel');
  const [network, setNetwork] = useState('4G/5G');
  const [startDate, setStartDate] = useState(() => new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pilihTanggalMulai = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowStartPicker(false);
    if (selected) setStartDate(selected);
  };

  const simpan = () => {
    const gb = parseFloat(quotaGB.replace(',', '.'));
    const durasi = parseInt(days, 10);
    if (!Number.isFinite(gb) || gb <= 0) {
      setError('Kuota harus angka lebih dari 0.');
      return;
    }
    if (!Number.isFinite(durasi) || durasi < 1) {
      setError('Masa aktif harus minimal 1 hari.');
      return;
    }
    setError(null);
    onSave({
      name: nama.trim() || 'Kuota Utama',
      quotaBytes: gb * GB,
      startDate: dateISOOf(startDate),
      durationDays: durasi,
      operator: operator.trim() || 'Telkomsel',
      network: network.trim() || '4G/5G',
    });
  };

  return (
    <View style={styles.formCard}>
      <Text style={styles.formLabel}>nama paket</Text>
      <TextInput
        style={styles.input}
        value={nama}
        onChangeText={setNama}
        accessibilityLabel="Nama paket"
        placeholder="Kuota Utama"
        placeholderTextColor={colors.secondary}
        maxLength={60}
      />
      <Text style={styles.formLabel}>kuota (GB)</Text>
      <TextInput
        style={styles.input}
        value={quotaGB}
        onChangeText={setQuotaGB}
        accessibilityLabel="Kuota dalam GB"
        keyboardType="decimal-pad"
      />
      <Text style={styles.formLabel}>tanggal mulai</Text>
      <Pressable
        style={styles.dateButton}
        onPress={() => setShowStartPicker(true)}
        accessibilityRole="button"
        accessibilityLabel="Pilih tanggal mulai paket"
      >
        <Text style={styles.dateButtonText}>{formatDateID(startDate)}</Text>
      </Pressable>
      {showStartPicker ? (
        <DateTimePicker value={startDate} mode="date" onChange={pilihTanggalMulai} />
      ) : null}
      <Text style={styles.formLabel}>masa aktif (hari)</Text>
      <TextInput
        style={styles.input}
        value={days}
        onChangeText={setDays}
        accessibilityLabel="Masa aktif dalam hari"
        keyboardType="number-pad"
      />
      <Text style={styles.formLabel}>operator</Text>
      <TextInput
        style={styles.input}
        value={operator}
        onChangeText={setOperator}
        accessibilityLabel="Operator"
      />
      <Text style={styles.formLabel}>jaringan (mis. 4G/5G)</Text>
      <TextInput
        style={styles.input}
        value={network}
        onChangeText={setNetwork}
        accessibilityLabel="Jaringan, misalnya 4G atau 5G"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.saveButton} onPress={simpan}>
        <Text style={styles.saveButtonText}>Simpan paket</Text>
      </Pressable>
    </View>
  );
}

/**
 * Detail / edit paket. Memakai `PackageCard`: menampilkan sisa,
 * terpakai, rata-rata, dan proyeksi dari data sejak tanggal mulai paket,
 * serta form ubah paket yang menyimpan ke penyimpanan. Menyimpan kembali
 * ke layar sebelumnya. Tanpa paket aktif, tampil form tambah paket +
 * riwayat (dengan pulihkan / hapus).
 */
export default function PackageDetailScreen() {
  const insets = useSafeAreaInsets();
  const {
    settings,
    updatePackage,
    startNewPackage,
    deleteActivePackage,
    deleteHistoryEntry,
    restoreHistoryEntry,
  } = useSettings();
  const { buckets, daily } = useUsage();
  const pkg = settings.pkg;
  // Ringkasan disimpan bersama paket yang dipakai untuk memintanya, supaya
  // layar tahu apakah data yang tampil sudah sesuai paket aktif — tanpa
  // setState sinkron di dalam effect (aturan lint).
  const [data, setData] = useState<{ pkg: typeof pkg; summary: UsageSummary } | null>(null);

  useEffect(() => {
    let aktif = true;
    if (pkg === null) {
      // Tanpa paket, tidak ada ringkasan yang dimuat — render memakai
      // cabang `pkg === null`, jadi data lama (bila ada) tidak tampil.
      return () => {
        aktif = false;
      };
    }
    // Detail paket memakai JENDELA PAKET (T2.1), sama seperti Beranda.
    const jendela = packageWindow(pkg.startDate);
    void getUsageSummaryForRange(jendela.start, jendela.end).then((s) => {
      if (aktif) {
        setData({ pkg, summary: s });
      }
    });
    return () => {
      aktif = false;
    };
  }, [pkg]);

  const quotaState = useMemo(
    // Kuota dihitung dari SELULER saja (prinsip 2); bucket diteruskan
    // untuk prediksi berbobot (T2.3).
    () =>
      pkg !== null && data && data.pkg === pkg
        ? computeQuota(pkg, data.summary.mobileBytes, new Date(), buckets)
        : null,
    [pkg, data, buckets],
  );

  const onSavePackage = (baru: QuotaPackage, opts: { archivePrevious: boolean }) => {
    // T2.7: tanggal mulai dari form dipakai apa adanya (tidak digeser
    // ke hari ini). Mulai paket baru mengarsipkan paket aktif ke
    // riwayat; simpan perubahan mengubah paket aktif di tempat.
    const simpan = opts.archivePrevious
      ? startNewPackage(baru)
      : updatePackage(baru);
    void simpan.then(() => router.back());
  };

  const onCreatePackage = (baru: QuotaPackage) => {
    void updatePackage(baru).then(() => router.back());
  };

  const hapusPaketAktif = () => {
    Alert.alert(
      'Hapus paket aktif?',
      'Paket aktif akan diarsipkan ke riwayat dan tidak ada lagi paket aktif sampai kamu menambah yang baru.',
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

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Kembali"
      >
        <Text style={styles.backText}>‹ Kembali</Text>
      </Pressable>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + layout.contentBottomPadding },
        ]}
      >
        <Text style={styles.title}>Detail paket</Text>
        {pkg === null ? (
          <>
            <Text style={styles.emptyNote}>
              Belum ada paket aktif. Isi paket yang sedang berjalan — atau lewati, Internet
              Tracker tetap memantau total internet tanpa paket.
            </Text>
            <PackageCreateForm onSave={onCreatePackage} />
          </>
        ) : quotaState ? (
          <>
            <PackageCard
              pkg={pkg}
              state={quotaState}
              todayMobileBytes={daily?.todayMobileBytes}
              onSave={onSavePackage}
            />
            <Pressable style={styles.deleteButton} onPress={hapusPaketAktif} hitSlop={4}>
              <Text style={styles.deleteButtonText}>Hapus paket</Text>
            </Pressable>
            {data?.summary.fromSnapshot ? (
              <Text style={styles.snapshot}>
                Terakhir diperbarui {formatCapWaktu(data.summary.updatedAt)}
              </Text>
            ) : null}
            {data?.summary.source === 'empty' ? (
              <Text style={styles.emptyNote}>
                Belum ada data tersimpan — beri izin akses penggunaan untuk angka asli.
              </Text>
            ) : null}
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        )}
        <Text style={styles.sectionTitle}>Riwayat paket</Text>
        <PackageHistoryList
          history={settings.history}
          onDelete={hapusEntriRiwayat}
          onRestore={(key) => void restoreHistoryEntry(key)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  back: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    ...typography.label,
    color: colors.primary,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  loader: {
    marginTop: 48,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.ink,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  snapshot: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  emptyNote: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  deleteButtonText: {
    ...typography.label,
    color: colors.critical,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  formLabel: {
    ...typography.label,
    color: colors.secondary,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.sageLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    ...typography.body,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: colors.sageLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  dateButtonText: {
    ...typography.body,
    color: colors.ink,
  },
  error: {
    ...typography.body,
    color: colors.critical,
    marginTop: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveButtonText: {
    ...typography.label,
    color: colors.onPrimary,
  },
});
