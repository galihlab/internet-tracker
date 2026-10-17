import { StyleSheet, Text, View } from 'react-native';
import { formatDateID, formatGB } from '../lib/format';
import {
  operatorLabel,
  packageLastDay,
  type ArchivedPackage,
} from '../lib/quota';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Daftar riwayat paket (T2.7): paket-paket lama yang sudah selesai dan
 * diarsipkan saat paket baru dimulai. Tampil di detail paket dan di
 * Pengaturan — hanya baca, tidak bisa diubah lagi.
 */
export default function PackageHistoryList({ history }: { history: ArchivedPackage[] }) {
  if (history.length === 0) {
    return <Text style={styles.empty}>Belum ada riwayat paket.</Text>;
  }
  return (
    <View>
      {history.map((pkg) => (
        <View
          key={`${pkg.startDate}-${pkg.archivedAt}`}
          style={styles.row}
        >
          <Text style={styles.name}>{pkg.name}</Text>
          <Text style={styles.meta}>
            {operatorLabel(pkg)} · {formatGB(pkg.quotaBytes)}
          </Text>
          <Text style={styles.meta}>
            Mulai {formatDateID(new Date(pkg.startDate))} · berakhir{' '}
            {formatDateID(packageLastDay(pkg))}
          </Text>
          <Text style={styles.meta}>
            Diarsipkan {formatDateID(new Date(pkg.archivedAt))}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    ...typography.body,
    color: colors.secondary,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  name: {
    ...typography.heading,
    color: colors.ink,
  },
  meta: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
});
