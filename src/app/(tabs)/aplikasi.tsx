import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AppUsageList from '../../components/AppUsageList';
import { formatBytes, formatCapWaktu } from '../../lib/format';
import { filterApps, sortApps, type AppSortKey } from '../../lib/appUsage';
import { useUsage } from '../../lib/usage';
import { periodLabel } from '../../lib/usageStats';
import { colors, layout, radius, spacing, typography } from '../../theme';

const SORT_OPTIONS: { kunci: AppSortKey; label: string }[] = [
  { kunci: 'mobile', label: 'Seluler' },
  { kunci: 'wifi', label: 'Wi-Fi' },
  { kunci: 'name', label: 'Nama' },
];

/**
 * Tab Aplikasi (T3.2 + T3.3): SEMUA aplikasi yang memakai data pada
 * periode terpilih, bisa diurutkan menurut pemakaian seluler / Wi-Fi /
 * nama, dan bisa dicari (kolom cari). Menekan baris membuka detail
 * aplikasi (nama paket mentah hanya tampil di sana, bukan di daftar).
 * Angka sudah terpecah per jaringan dan terekonsiliasi terhadap total
 * perangkat (lihat `periodApps` di UsageProvider).
 */
export default function AplikasiScreen() {
  const insets = useSafeAreaInsets();
  const { period, summary, periodApps, loading } = useUsage();
  const [cari, setCari] = useState('');
  const [urut, setUrut] = useState<AppSortKey>('mobile');

  const tampil = useMemo(
    () => filterApps(sortApps(periodApps, urut), cari),
    [periodApps, urut, cari],
  );

  const totalPerangkat = summary ? summary.totalBytes : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + layout.contentBottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Aplikasi</Text>
        <Text style={styles.subtitle}>
          {periodLabel(period)}
          {summary ? ` · total ${formatBytes(totalPerangkat)}` : ''}
        </Text>

        <TextInput
          style={styles.search}
          value={cari}
          onChangeText={setCari}
          placeholder="Cari aplikasi…"
          placeholderTextColor={colors.secondary}
          returnKeyType="search"
          accessibilityLabel="Cari aplikasi"
        />

        <View style={styles.sortRow} accessibilityRole="tablist" accessibilityLabel="Urutkan aplikasi">
          {SORT_OPTIONS.map((opt) => {
            const aktif = urut === opt.kunci;
            return (
              <Pressable
                key={opt.kunci}
                style={[styles.sortButton, aktif && styles.sortButtonActive]}
                onPress={() => setUrut(opt.kunci)}
                accessibilityRole="button"
                accessibilityState={{ selected: aktif }}
                accessibilityLabel={`Urutkan menurut ${opt.label}`}
              >
                <Text style={[styles.sortText, aktif && styles.sortTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading || !summary ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : tampil.length === 0 ? (
          <Text style={styles.empty}>
            {cari.trim() === ''
              ? 'Belum ada pemakaian aplikasi pada periode ini.'
              : `Tidak ada aplikasi yang cocok dengan “${cari.trim()}”.`}
          </Text>
        ) : (
          <AppUsageList
            perApp={tampil}
            totalBytes={totalPerangkat}
            onPressApp={(app) =>
              router.push({
                pathname: '/app-detail',
                params: { packageName: app.packageName, label: app.label },
              })
            }
          />
        )}

        <Text style={styles.footnote}>
          persen dihitung terhadap total pemakaian perangkat pada periode terpilih.
          {summary?.source === 'sample'
            ? ' Data contoh — modul native tidak tersedia di lingkungan ini.'
            : ''}
          {summary?.fromSnapshot
            ? ` Terakhir diperbarui ${formatCapWaktu(summary.updatedAt)}.`
            : ''}
          {summary?.source === 'empty'
            ? ' Belum ada data tersimpan — beri izin akses penggunaan untuk angka asli.'
            : ''}
        </Text>
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
  },
  subtitle: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  search: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.ink,
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  sortButton: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.sageLight,
  },
  sortButtonActive: {
    backgroundColor: colors.primary,
  },
  sortText: {
    ...typography.label,
    color: colors.ink,
  },
  sortTextActive: {
    color: colors.onPrimary,
  },
  loader: {
    marginTop: 48,
  },
  empty: {
    ...typography.body,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  footnote: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
