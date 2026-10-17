import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import PackageCard from '../components/PackageCard';
import PackageHistoryList from '../components/PackageHistoryList';
import { computeQuota, type QuotaPackage } from '../lib/quota';
import { useSettings } from '../lib/settings';
import { useUsage } from '../lib/usage';
import { getUsageSummaryForRange, type UsageSummary } from '../lib/usageStats';
import { formatCapWaktu } from '../lib/format';
import { packageWindow } from '../lib/windows';
import { colors, layout, spacing, typography } from '../theme';

/**
 * Detail / edit paket. Memakai `PackageCard`: menampilkan sisa,
 * terpakai, rata-rata, dan proyeksi dari data sejak tanggal mulai paket,
 * serta form ubah paket yang menyimpan ke penyimpanan. Menyimpan kembali
 * ke layar sebelumnya.
 */
export default function PackageDetailScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updatePackage, startNewPackage } = useSettings();
  const { buckets, daily } = useUsage();
  const pkg = settings.pkg;
  // Ringkasan disimpan bersama paket yang dipakai untuk memintanya, supaya
  // layar tahu apakah data yang tampil sudah sesuai paket aktif — tanpa
  // setState sinkron di dalam effect (aturan lint).
  const [data, setData] = useState<{ pkg: typeof pkg; summary: UsageSummary } | null>(null);

  useEffect(() => {
    let aktif = true;
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
      data && data.pkg === pkg
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
        {quotaState ? (
          <>
            <PackageCard
              pkg={pkg}
              state={quotaState}
              todayMobileBytes={daily?.todayMobileBytes}
              onSave={onSavePackage}
            />
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
        <PackageHistoryList history={settings.history} />
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
});
