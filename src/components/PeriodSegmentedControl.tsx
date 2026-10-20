import { useEffect } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Period } from '../lib/usageStats';
import { colors, radius, spacing, typography } from '../theme';
import { useSlidingPill } from './useSlidingPill';

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
  // Pill putih aktif meluncur mengikuti segmen — pola yang sama dengan
  // dock tab (useSlidingPill).
  const { x, width, moveTo, handleLayout } = useSlidingPill();

  useEffect(() => {
    moveTo(value);
  }, [value, moveTo]);

  return (
    <View style={styles.row} accessibilityRole="tablist">
      <Animated.View
        pointerEvents="none"
        style={[styles.indicator, { width, transform: [{ translateX: x }] }]}
      />
      {SEGMENTS.map((s) => {
        const active = value === s.key;
        return (
          <Pressable
            key={s.key}
            onPress={() => onChange(s.key)}
            onLayout={handleLayout(s.key, active)}
            style={styles.segment}
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
  // Pill indikator segmen aktif — posisinya digeser oleh useSlidingPill.
  indicator: {
    position: 'absolute',
    top: spacing.xs,
    bottom: spacing.xs,
    left: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    // Bayangan tipis supaya pill terasa terangkat dari relnya.
    elevation: 2,
    shadowColor: colors.ink,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  label: {
    ...typography.label,
    color: colors.secondary,
  },
  labelActive: {
    color: colors.primary,
  },
});
