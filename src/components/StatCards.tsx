import { StyleSheet, Text, View } from 'react-native';
import { formatBytes, formatPercent } from '../lib/format';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  wifiBytes: number;
  mobileBytes: number;
};

/** Dua kartu ringkasan seluler / Wi-Fi untuk periode terpilih. */
export default function StatCards({ wifiBytes, mobileBytes }: Props) {
  const total = wifiBytes + mobileBytes;
  return (
    <View style={styles.row}>
      <View style={styles.card}>
        <View style={styles.labelRow}>
          <View style={[styles.dot, { backgroundColor: colors.progress }]} />
          <Text style={styles.cardLabel}>Seluler</Text>
        </View>
        <Text style={styles.cardValue}>{formatBytes(mobileBytes)}</Text>
        <Text style={styles.cardPercent}>{formatPercent(mobileBytes, total)}</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.labelRow}>
          <View style={[styles.dot, { backgroundColor: colors.sageActive }]} />
          <Text style={styles.cardLabel}>Wi-Fi</Text>
        </View>
        <Text style={styles.cardValue}>{formatBytes(wifiBytes)}</Text>
        <Text style={styles.cardPercent}>{formatPercent(wifiBytes, total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardLabel: {
    ...typography.body,
    color: colors.secondary,
  },
  cardValue: {
    ...typography.bigNumber,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  cardPercent: {
    ...typography.body,
    color: colors.primary,
    marginTop: spacing.xs,
  },
});
