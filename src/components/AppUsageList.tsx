import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppIcon from './AppIcon';
import { formatBytes, formatPercent } from '../lib/format';
import { useAppIcons } from '../lib/appIcons';
import { SYSTEM_ROW_PACKAGE } from '../lib/appUsage';
import type { AppUsage } from '../lib/usageStats';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  /** Daftar per aplikasi (sudah terekonsiliasi, T3.3). */
  perApp: AppUsage[];
  /** Total perangkat (seluler + Wi-Fi) pada periode yang sama — penyebut persen. */
  totalBytes: number;
  /** Bila diisi, tiap baris aplikasi bisa ditekan. Baris sistem tidak bisa ditekan. */
  onPressApp?: (app: AppUsage) => void;
};

/**
 * Daftar pemakaian per aplikasi (T3.2 + T3.3): setiap baris memakai
 * susunan referensi — ikon asli, nama, bar, ukuran, persen, chevron —
 * plus keterangan pecahan "Seluler X · Wi-Fi Y" di bawah bar. Nama paket
 * mentah TIDAK tampil di daftar (hanya di layar detail). Baris "Sistem
 * dan lainnya" tidak bisa ditekan karena bukan satu aplikasi.
 */
export default function AppUsageList({ perApp, totalBytes, onPressApp }: Props) {
  const icons = useAppIcons(perApp.map((a) => a.packageName));

  if (perApp.length === 0) {
    return <Text style={styles.empty}>Belum ada pemakaian aplikasi pada periode ini.</Text>;
  }
  return (
    <View style={styles.list}>
      {perApp.map((app) => {
        const percent = totalBytes > 0 ? Math.min(100, (app.bytes / totalBytes) * 100) : 0;
        const bisaDitekan = Boolean(onPressApp) && app.packageName !== SYSTEM_ROW_PACKAGE;
        const isi = (
          <>
            <AppIcon iconBase64={icons[app.packageName]?.iconBase64} label={app.label} size={44} />
            <View style={styles.middle}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {app.label}
                </Text>
                <Text style={styles.size}>{formatBytes(app.bytes)}</Text>
              </View>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${percent}%` }]} />
              </View>
              <View style={styles.subRow}>
                <Text style={styles.split}>
                  Seluler {formatBytes(app.mobileBytes)} · Wi-Fi {formatBytes(app.wifiBytes)}
                </Text>
                <Text style={styles.percent}>{formatPercent(app.bytes, totalBytes)}</Text>
              </View>
            </View>
            {bisaDitekan ? <Text style={styles.chevron}>›</Text> : null}
          </>
        );
        return bisaDitekan && onPressApp ? (
          <Pressable
            key={app.packageName}
            style={styles.row}
            onPress={() => onPressApp(app)}
            accessibilityRole="button"
            accessibilityLabel={`Detail ${app.label}`}
          >
            {isi}
          </Pressable>
        ) : (
          <View
            key={app.packageName}
            style={styles.row}
            accessibilityLabel={`${app.label}, ${formatBytes(app.bytes)}`}
          >
            {isi}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
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
  barBg: {
    height: 6,
    backgroundColor: colors.sageLight,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    backgroundColor: colors.progress,
    borderRadius: radius.pill,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  split: {
    ...typography.caption,
    color: colors.secondary,
    flex: 1,
  },
  percent: {
    ...typography.caption,
    color: colors.secondary,
  },
  chevron: {
    fontSize: 20,
    color: colors.secondary,
  },
  empty: {
    ...typography.body,
    color: colors.secondary,
  },
});
