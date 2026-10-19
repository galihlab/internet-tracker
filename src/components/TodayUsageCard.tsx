import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { formatBytes } from '../lib/format';
import type { DailyUsage } from '../lib/usage';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  /** Data harian dari UsageProvider; null selama memuat. */
  daily: DailyUsage | null;
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 72;
const BAR_WIDTH = 26;

/** Teks delta terhadap kemarin pada jam yang sama. */
function deltaText(today: number, yesterday: number): { text: string; naik: boolean | null } {
  if (yesterday <= 0) {
    if (today <= 0) return { text: 'Belum ada pemakaian', naik: null };
    return { text: 'Kemarin belum tercatat', naik: null };
  }
  const persen = Math.round(((today - yesterday) / yesterday) * 100);
  if (persen === 0) return { text: 'Sama seperti kemarin', naik: null };
  return {
    text: `${persen > 0 ? '▲' : '▼'} ${Math.abs(persen)}% dari kemarin`,
    naik: persen > 0,
  };
}

/**
 * Kartu Penggunaan Hari Ini (T1.7 + T2.2): seluler sejak tengah malam,
 * delta persen terhadap KEMARIN PADA JAM YANG SAMA (bukan kemarin
 * seharian — supaya adil), grafik batang 7 hari dengan hari ini disorot
 * hijau tua. Data dibaca dari bucket harian ter-cache; bila tampil
 * snapshot terakhir (query gagal / izin dicabut), cap "terakhir
 * diperbarui" ditampilkan — bukan data contoh diam-diam.
 */
export default function TodayUsageCard({ daily }: Props) {
  if (!daily) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Penggunaan Hari Ini</Text>
        <Text style={styles.loading}>Memuat…</Text>
      </View>
    );
  }

  const delta = deltaText(daily.todayMobileBytes, daily.yesterdaySameHourMobileBytes);
  const wifiHariIni = daily.last7Days.find((d) => d.isToday)?.wifiBytes ?? 0;
  const maks = Math.max(1, ...daily.last7Days.map((d) => d.mobileBytes));
  const slotWidth = CHART_WIDTH / 7;
  // Cap waktu snapshot terakhir — hanya tampil bila data berasal dari
  // snapshot (query gagal / izin dicabut), bukan dari query segar.
  const capSnapshot = daily.fromSnapshot
    ? `Terakhir diperbarui ${new Date(daily.updatedAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
      })} ${new Date(daily.updatedAt).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Penggunaan Hari Ini</Text>
      <Text style={styles.big}>{formatBytes(daily.todayMobileBytes)}</Text>
      <Text style={styles.delta}>{delta.text}</Text>
      <Text style={styles.wifi}>Wi-Fi hari ini {formatBytes(wifiHariIni)} · tidak mengurangi kuota</Text>
      {capSnapshot ? <Text style={styles.snapshot}>{capSnapshot}</Text> : null}
      <Svg
        width="100%"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={styles.chart}
        accessibilityLabel="Grafik batang pemakaian seluler 7 hari terakhir"
      >
        {daily.last7Days.map((d, i) => {
          const tinggi = d.mobileBytes > 0 ? Math.max(3, (d.mobileBytes / maks) * 52) : 0;
          const x = i * slotWidth + (slotWidth - BAR_WIDTH) / 2;
          return (
            <Rect
              key={d.dateISO}
              x={x}
              y={56 - tinggi}
              width={BAR_WIDTH}
              height={tinggi}
              rx={6}
              fill={d.isToday ? colors.primary : colors.sageActive}
            />
          );
        })}
        {daily.last7Days.map((d, i) => (
          <SvgText
            key={`label-${d.dateISO}`}
            x={i * slotWidth + slotWidth / 2}
            y={70}
            fontSize={11}
            fill={d.isToday ? colors.primary : colors.secondary}
            textAnchor="middle"
            fontWeight={d.isToday ? '700' : '400'}
          >
            {d.label}
          </SvgText>
        ))}
      </Svg>
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
  delta: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  wifi: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  snapshot: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.xs,
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
