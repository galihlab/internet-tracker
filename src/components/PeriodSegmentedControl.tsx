import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Period } from '../lib/usageStats';
import { colors, radius, spacing, typography } from '../theme';

const SEGMENTS: { key: Period; label: string }[] = [
  { key: '24h', label: 'Hari ini' },
  { key: '7d', label: '7 hari' },
  { key: '30d', label: '30 hari' },
  { key: 'custom', label: 'Custom' },
];

type Props = {
  value: Period;
  onChange: (p: Period) => void;
};

/**
 * Kontrol segmen pill berlatar (T1.10): pengganti PeriodTabs lama.
 * Label pendek ("Hari ini", "7 hari", "30 hari") supaya muat satu baris
 * di lebar 360dp. Dipakai di Statistik sebagai pengatur grafik — Beranda
 * selalu menampilkan keadaan paket saat ini, bukan periode yang bisa
 * diganti-ganti.
 */
export default function PeriodSegmentedControl({ value, onChange }: Props) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {SEGMENTS.map((s) => {
        const active = value === s.key;
        return (
          <Pressable
            key={s.key}
            onPress={() => onChange(s.key)}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={s.label}
            hitSlop={4}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.sageLight,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  label: {
    ...typography.label,
    color: colors.secondary,
  },
  labelActive: {
    color: colors.primary,
  },
});
