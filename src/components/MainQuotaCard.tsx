import { Pressable, StyleSheet, Text, View } from 'react-native';
import AnimatedBar from './AnimatedBar';
import { formatDateID, formatGB } from '../lib/format';
import { operatorLabel, type QuotaPackage, type QuotaState } from '../lib/quota';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  pkg: QuotaPackage;
  /** Dihitung dari pemakaian SELULER saja (prinsip 2) — satu sumber kebenaran dengan welcome. */
  state: QuotaState;
  onPress: () => void;
};

/**
 * Kartu utama sisa kuota (T1.6): satu kartu sage sesuai referensi.
 * Menekan kartu membuka detail paket. MENGGANTIKAN PackageCard dan
 * UsageRing versi lama di Beranda.
 */
export default function MainQuotaCard({ pkg, state, onPress }: Props) {
  // Sisa hari masa aktif: dibulatkan ke atas dari hari yang belum berjalan
  // penuh — paket 5 hari yang baru berjalan pagi ini masih "5 hari lagi".
  const sisaHari = Math.max(0, Math.ceil(state.totalDays - state.elapsedDays));

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Detail paket"
    >
      <Text style={styles.label}>Sisa Kuota</Text>
      <Text style={styles.operator}>{operatorLabel(pkg)}</Text>
      <Text style={styles.big}>
        {formatGB(state.remainingBytes)}
        <Text style={styles.bigMuted}> dari {formatGB(pkg.quotaBytes)}</Text>
      </Text>
      <Text style={styles.used}>{Math.round(state.usedPercent)}% terpakai</Text>
      <View style={styles.barWrap}>
        <AnimatedBar
          percent={state.usedPercent}
          height={10}
          backgroundColor={colors.surface}
          fillColor={colors.progress}
          accessibilityLabel={`${Math.round(state.usedPercent)}% terpakai`}
        />
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Reset {formatDateID(state.packageEnd)}</Text>
        <Text style={styles.footerText}>
          {sisaHari > 0 ? `${sisaHari} hari lagi` : 'Masa aktif berakhir'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.sageLight,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.primary,
  },
  operator: {
    ...typography.body,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  big: {
    ...typography.bigNumber,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  bigMuted: {
    ...typography.body,
    color: colors.secondary,
  },
  used: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  barWrap: {
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  footerText: {
    ...typography.caption,
    color: colors.ink,
  },
});
