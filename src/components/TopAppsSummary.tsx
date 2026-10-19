import { Pressable, StyleSheet, Text, View } from 'react-native';
import AnimatedBar from './AnimatedBar';
import AppIcon from './AppIcon';
import { formatBytes, formatPercent } from '../lib/format';
import { useAppIcons } from '../lib/appIcons';
import { SYSTEM_ROW_PACKAGE } from '../lib/appUsage';
import type { AppUsage } from '../lib/usageStats';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  /** Tiga aplikasi teratas pada periode paket berjalan. */
  perApp: AppUsage[];
  /** Total INTERNET periode berjalan (seluler + Wi-Fi) — penyebut persen. */
  totalBytes: number;
  onPressApp: (app: AppUsage) => void;
  onSeeAll: () => void;
};

/**
 * Ringkasan pemakaian aplikasi di Beranda (v1.2.0, internet-first):
 * tiga aplikasi teratas menurut TOTAL internet, dengan IKON ASLI dari
 * PackageManager (fallback monogram generik bila ikon tidak tersedia —
 * bukan logo palsu), nama, progress bar, ukuran TOTAL, persen terhadap
 * total internet periode berjalan, plus "Lihat Semua". Baris "Sistem dan
 * lainnya" dikecualikan — bukan aplikasi yang bisa dibuka detailnya.
 */
export default function TopAppsSummary({ perApp, totalBytes, onPressApp, onSeeAll }: Props) {
  const top = perApp.filter((a) => a.packageName !== SYSTEM_ROW_PACKAGE).slice(0, 3);
  const icons = useAppIcons(top.map((a) => a.packageName));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Pemakaian Aplikasi</Text>
        <Pressable
          onPress={onSeeAll}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Lihat semua aplikasi"
          style={styles.seeAllButton}
        >
          <Text style={styles.seeAll}>Lihat Semua ›</Text>
        </Pressable>
      </View>
      {top.length === 0 ? (
        <Text style={styles.empty}>Belum ada pemakaian aplikasi pada periode ini.</Text>
      ) : (
        top.map((app) => {
          const percent = totalBytes > 0 ? Math.round((app.bytes / totalBytes) * 100) : 0;
          return (
            <Pressable
              key={app.packageName}
              style={styles.row}
              onPress={() => onPressApp(app)}
              accessibilityRole="button"
              accessibilityLabel={`Detail ${app.label}`}
            >
              <AppIcon iconBase64={icons[app.packageName]?.iconBase64} label={app.label} size={44} />
              <View style={styles.middle}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {app.label}
                  </Text>
                  <Text style={styles.size}>{formatBytes(app.bytes)}</Text>
                </View>
                <View style={styles.barWrap}>
                  <AnimatedBar
                    percent={percent}
                    height={6}
                    accessibilityLabel={`${app.label}, ${percent}% dari total internet`}
                  />
                </View>
                <Text style={styles.percent}>{formatPercent(app.bytes, totalBytes)} dari total internet</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.heading,
    color: colors.ink,
  },
  seeAll: {
    ...typography.label,
    color: colors.primary,
  },
  seeAllButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  empty: {
    ...typography.body,
    color: colors.secondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  middle: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  name: {
    ...typography.bodyBold,
    color: colors.ink,
    flex: 1,
  },
  size: {
    ...typography.body,
    color: colors.ink,
  },
  barWrap: {
    marginTop: spacing.sm,
  },
  percent: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  chevron: {
    fontSize: 20,
    color: colors.secondary,
  },
});
