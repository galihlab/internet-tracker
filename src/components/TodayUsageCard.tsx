import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import type { DailyUsage } from '../lib/usage';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  /** Data harian dari UsageProvider; null selama memuat. */
  daily: DailyUsage | null;
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 72;
const BAR_WIDTH = 26;

/**
 * Kartu grafik 7 hari (v1.2.0, internet-first): batang bertumpuk TOTAL
 * internet per hari — seluler di bawah (gelap), Wi-Fi di atas (terang) —
 * dengan legenda. Angka "hari ini" hidup di InternetTodayCard di atas;
 * kartu ini hanya grafiknya. Bila tampil snapshot terakhir (query gagal
 * / izin dicabut), cap "terakhir diperbarui" ditampilkan — bukan data
 * contoh diam-diam.
 */
export default function TodayUsageCard({ daily }: Props) {
  if (!daily) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Internet 7 hari terakhir</Text>
        <Text style={styles.loading}>Memuat…</Text>
      </View>
    );
  }

  const maks = Math.max(1, ...daily.last7Days.map((d) => d.mobileBytes + d.wifiBytes));
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
      <Text style={styles.title}>Internet 7 hari terakhir</Text>
      {capSnapshot ? <Text style={styles.snapshot}>{capSnapshot}</Text> : null}
      <Svg
        width="100%"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={styles.chart}
        accessibilityLabel="Grafik batang total internet 7 hari terakhir: seluler dan Wi-Fi bertumpuk per hari"
      >
        {daily.last7Days.map((d, i) => {
          const total = d.mobileBytes + d.wifiBytes;
          const tinggi = total > 0 ? Math.max(3, (total / maks) * 52) : 0;
          const tinggiSeluler = total > 0 ? (d.mobileBytes / total) * tinggi : 0;
          const tinggiWifi = tinggi - tinggiSeluler;
          const x = i * slotWidth + (slotWidth - BAR_WIDTH) / 2;
          return (
            <Fragment key={d.dateISO}>
              <Rect
                x={x}
                y={56 - tinggi}
                width={BAR_WIDTH}
                height={tinggiWifi}
                rx={6}
                fill={colors.sageActive}
              />
              <Rect
                x={x}
                y={56 - tinggiSeluler}
                width={BAR_WIDTH}
                height={tinggiSeluler}
                rx={6}
                fill={colors.primary}
              />
            </Fragment>
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
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>Seluler</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.sageActive }]} />
          <Text style={styles.legendText}>Wi-Fi</Text>
        </View>
      </View>
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
  legend: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    ...typography.caption,
    color: colors.secondary,
  },
});
