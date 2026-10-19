import { StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '../lib/format';
import type { DailyUsage } from '../lib/usage';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  /** Data harian dari UsageProvider; null selama memuat. */
  daily: DailyUsage | null;
};

/**
 * Kartu utama Beranda (v1.2.0, internet-first): TOTAL internet hari ini
 * (seluler + Wi-Fi) sebagai angka utama, dengan pecahannya dan total
 * kemarin seharian sebagai pembanding. Kemarin ditampilkan apa adanya
 * (seharian penuh), tanpa delta persen yang menyesatkan — hari ini
 * masih parsial, jadi perbandingan persen terhadap kemarin seharian
 * tidak adil. Kuota seluler hidup di kartu paket di bawah, bukan di sini.
 */
export default function InternetTodayCard({ daily }: Props) {
  if (!daily) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Internet hari ini</Text>
        <Text style={styles.loading}>Memuat…</Text>
      </View>
    );
  }

  const hariIni = daily.last7Days.find((d) => d.isToday);
  const totalHariIni = (hariIni?.mobileBytes ?? 0) + (hariIni?.wifiBytes ?? 0);
  // Kemarin = entri kedua dari belakang (deret 7 hari berakhir hari ini).
  const kemarin = daily.last7Days.length >= 2
    ? daily.last7Days[daily.last7Days.length - 2]
    : undefined;
  const totalKemarin = kemarin ? kemarin.mobileBytes + kemarin.wifiBytes : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Internet hari ini</Text>
      <Text style={styles.big}>{formatBytes(totalHariIni)}</Text>
      <Text style={styles.split}>
        Seluler {formatBytes(hariIni?.mobileBytes ?? 0)} · Wi-Fi{' '}
        {formatBytes(hariIni?.wifiBytes ?? 0)}
      </Text>
      <Text style={styles.kemarin}>
        {totalKemarin === null
          ? 'Kemarin belum tercatat'
          : `Kemarin total ${formatBytes(totalKemarin)} (seharian)`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  title: {
    ...typography.label,
    color: colors.secondary,
  },
  big: {
    ...typography.bigNumber,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  split: {
    ...typography.body,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  kemarin: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  loading: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
});
