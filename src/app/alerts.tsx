import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { formatDateID } from '../lib/format';
import type { Alert } from '../lib/alerts';
import { useUsage } from '../lib/usage';
import { colors, layout, radius, spacing, typography } from '../theme';

/** Label jenis entri (T4.3) — sumber tiap peringatan harus terbaca. */
function labelJenis(alert: Alert): string {
  switch (alert.kind) {
    case 'lonjakan-harian':
      return 'Lonjakan pemakaian';
    case 'aplikasi-dominan':
      return 'Aplikasi dominan';
    case 'ambang-kuota':
      return alert.thresholdPercent !== undefined
        ? `Ambang kuota ${alert.thresholdPercent}%`
        : 'Ambang kuota';
    case 'prediksi-kritis':
      return 'Prediksi kritis';
  }
}

/**
 * Daftar peringatan (T1.5 + T2.6 + T4.3): rute yang dibuka lonceng Beranda.
 * Berisi SATU SUMBER dengan notifikasi (T4.3): entri lonjakan (T2.6),
 * ambang tercapai (T4.2), dan prediksi kritis (T4.2), masing-masing
 * bertanggal, berangka penyebabnya, dan berlabel jenisnya supaya
 * sumber tiap entri terbaca. Membuka daftar ini menandai semua
 * peringatan sudah dibaca sehingga titik merah lonceng padam.
 */
export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { alerts, markAlertsRead } = useUsage();

  // Membaca daftar mengosongkan titik merah. Pengecualian aturan
  // set-state-in-effect yang ditargetkan: menandai sudah dibaca adalah
  // efek samping pembukaan layar, bukan sinkronisasi state antar komponen.
  useEffect(() => {
    void markAlertsRead();
  }, [markAlertsRead]);

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
      {alerts.length === 0 ? (
        <View style={styles.empty}>
          <Svg
            width={48}
            height={48}
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.secondary}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
            <Path d="M10 20a2.2 2.2 0 0 0 4 0" />
          </Svg>
          <Text style={styles.emptyTitle}>Belum ada peringatan</Text>
          <Text style={styles.emptyText}>
            Peringatan lonjakan pemakaian, ambang kuota tercapai, dan prediksi kritis akan tampil
            di sini.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + layout.contentBottomPadding },
          ]}
        >
          <Text style={styles.title}>Peringatan</Text>
          {alerts.map((alert) => (
            <View
              key={alert.id}
              style={styles.card}
              accessibilityLabel={`${labelJenis(alert)}: ${alert.title}`}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>{formatDateID(new Date(alert.dateISO))}</Text>
                {!alert.read ? (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>Baru</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.kindChip}>
                <Text style={styles.kindChipText}>{labelJenis(alert)}</Text>
              </View>
              <Text style={styles.cardTitle}>{alert.title}</Text>
              {/* Detail selalu memuat angka penyebabnya (T2.6 + T4.2). */}
              <Text style={styles.cardDetail}>{alert.detail}</Text>
            </View>
          ))}
        </ScrollView>
      )}
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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.ink,
    marginTop: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  list: {
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDate: {
    ...typography.caption,
    color: colors.secondary,
  },
  newBadge: {
    backgroundColor: colors.critical,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  newBadgeText: {
    ...typography.caption,
    color: colors.onPrimary,
  },
  kindChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sageLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.sm,
  },
  kindChipText: {
    ...typography.caption,
    color: colors.primary,
  },
  cardTitle: {
    ...typography.heading,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  cardDetail: {
    ...typography.body,
    color: colors.ink,
    marginTop: spacing.xs,
  },
});
