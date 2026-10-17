import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { formatDateID, formatGB } from '../lib/format';
import type { QuotaState } from '../lib/quota';
import type { DailyUsage } from '../lib/usage';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  /** Dihitung dari pemakaian SELULER saja via computeQuota + prediksi berbobot (T2.3). */
  state: QuotaState | null;
  /** Data harian untuk grafik garis mini pemakaian kumulatif. */
  daily: DailyUsage | null;
  onPress: () => void;
};

const CHART_WIDTH = 300;
const CHART_HEIGHT = 44;

/**
 * Kartu Prediksi Kuota (T1.8 + T2.3): prediksi berbobot — bukan satu
 * tanggal palsu-presisi, melainkan RENTANG (skenario boros → hemat)
 * beserta dasarnya (rata-rata berbobot dari N hari penuh). Jika data
 * belum cukup satu hari penuh, kartu menulis keadaan belum-cukup-data
 * dan TIDAK mengarang angka.
 */
export default function PredictionCard({ state, daily, onPress }: Props) {
  if (!state) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Prediksi Kuota</Text>
        <Text style={styles.loading}>Memuat…</Text>
      </View>
    );
  }

  const { forecast, remainingBytes, packageEnd } = state;

  // Belum cukup data: belum ada satu pun hari penuh tercatat.
  if (!forecast.hasEnoughData) {
    return (
      <Pressable
        style={styles.card}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Prediksi kuota, buka Statistik"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Prediksi Kuota</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
        <Text style={styles.empty}>Prediksi muncul setelah satu hari penuh tercatat.</Text>
      </Pressable>
    );
  }

  let headline: string;
  let basis: string;
  if (remainingBytes <= 0) {
    headline = 'Kuota habis';
    basis = 'Kuota paket sudah terpakai seluruhnya.';
  } else if (
    forecast.projectedRunOut === null ||
    forecast.projectedRunOut >= packageEnd
  ) {
    // Laju nol, atau proyeksi berbobot melewati akhir masa aktif:
    // kuota cukup sampai masa aktif berakhir.
    headline = 'Cukup sampai masa aktif berakhir';
    basis =
      forecast.weightedAvgBytes > 0
        ? `Berdasarkan rata-rata berbobot ${formatGB(forecast.weightedAvgBytes)}/hari dari ${forecast.fullDaysCount} hari penuh`
        : 'Belum ada pemakaian pada hari-hari penuh yang tercatat.';
  } else if (forecast.borosDate && forecast.hematDate) {
    headline =
      formatDateID(forecast.borosDate) === formatDateID(forecast.hematDate)
        ? `Habis sekitar ${formatDateID(forecast.borosDate)}`
        : `Habis sekitar ${formatDateID(forecast.borosDate)} – ${formatDateID(forecast.hematDate)}`;
    basis = `Berdasarkan rata-rata berbobot ${formatGB(forecast.weightedAvgBytes)}/hari dari ${forecast.fullDaysCount} hari penuh · boros: pemakaian hari tertinggi, hemat: terendah`;
  } else if (forecast.borosDate) {
    // Skenario hemat tidak pernah habis (P25 nol): hanya batas cepat.
    headline = `Habis paling cepat ${formatDateID(forecast.borosDate)}`;
    basis = `Berdasarkan rata-rata berbobot ${formatGB(forecast.weightedAvgBytes)}/hari dari ${forecast.fullDaysCount} hari penuh`;
  } else {
    headline = 'Cukup sampai masa aktif berakhir';
    basis = `Berdasarkan rata-rata berbobot ${formatGB(forecast.weightedAvgBytes)}/hari dari ${forecast.fullDaysCount} hari penuh`;
  }

  // Grafik garis mini: pemakaian seluler kumulatif 7 hari terakhir.
  let points = '';
  if (daily && daily.last7Days.length >= 2) {
    let kumulatif = 0;
    const seri = daily.last7Days.map((d) => {
      kumulatif += d.mobileBytes;
      return kumulatif;
    });
    const maks = Math.max(1, ...seri);
    points = seri
      .map((nilai, i) => {
        const x = (i / (seri.length - 1)) * CHART_WIDTH;
        const y = CHART_HEIGHT - 4 - (nilai / maks) * (CHART_HEIGHT - 8);
        return `${x},${y}`;
      })
      .join(' ');
  }

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Prediksi kuota, buka Statistik"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Prediksi Kuota</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.basis}>{basis}</Text>
      {points ? (
        <Svg
          width="100%"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          style={styles.chart}
          accessibilityLabel="Grafik garis mini pemakaian seluler kumulatif 7 hari terakhir"
        >
          <Polyline
            points={points}
            fill="none"
            stroke={colors.progress}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typography.label,
    color: colors.secondary,
  },
  chevron: {
    fontSize: 20,
    color: colors.secondary,
  },
  headline: {
    ...typography.heading,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  basis: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  empty: {
    ...typography.body,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  loading: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
  chart: {
    marginTop: spacing.md,
    height: CHART_HEIGHT,
  },
});
