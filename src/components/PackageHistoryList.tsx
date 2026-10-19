import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDateID, formatGB } from '../lib/format';
import {
  historyEntryKey,
  operatorLabel,
  packageLastDay,
  type ArchivedPackage,
} from '../lib/quota';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Daftar riwayat paket (T2.7): paket-paket lama yang sudah selesai dan
 * diarsipkan saat paket baru dimulai / paket aktif dihapus. Tiap entri
 * bisa dipulihkan menjadi paket aktif atau dihapus — konfirmasi
 * penghapusan ditangani pemanggil (onDelete/onRestore dipanggil
 * langsung). Tanpa callback, daftar hanya baca seperti sebelumnya.
 */
export default function PackageHistoryList({
  history,
  onDelete,
  onRestore,
}: {
  history: ArchivedPackage[];
  onDelete?: (key: string) => void;
  onRestore?: (key: string) => void;
}) {
  if (history.length === 0) {
    return <Text style={styles.empty}>Belum ada riwayat paket.</Text>;
  }
  return (
    <View>
      {history.map((pkg) => {
        const key = historyEntryKey(pkg);
        return (
          <View key={key} style={styles.row}>
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
            {onRestore || onDelete ? (
              <View style={styles.actions}>
                {onRestore ? (
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => onRestore(key)}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`Pulihkan paket ${pkg.name}`}
                  >
                    <Text style={styles.actionText}>Pulihkan</Text>
                  </Pressable>
                ) : null}
                {onDelete ? (
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => onDelete(key)}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`Hapus riwayat paket ${pkg.name}`}
                  >
                    <Text style={[styles.actionText, styles.deleteText]}>Hapus</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
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
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  actionButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    ...typography.label,
    color: colors.primary,
  },
  deleteText: {
    color: colors.critical,
  },
});
