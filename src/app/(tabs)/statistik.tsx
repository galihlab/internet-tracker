import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import AppIcon from '../../components/AppIcon';
import CustomRangePicker from '../../components/CustomRangePicker';
import PeriodSegmentedControl from '../../components/PeriodSegmentedControl';
import StatCards from '../../components/StatCards';
import { useAppIcons } from '../../lib/appIcons';
import { SYSTEM_ROW_PACKAGE, topAppForDay } from '../../lib/appUsage';
import { buildPolylinePoints } from '../../lib/chartPoints';
import { formatBytes, formatCapWaktu, formatDateID } from '../../lib/format';
import { useSettings } from '../../lib/settings';
import { useUsage } from '../../lib/usage';
import { periodLabel, periodToRange } from '../../lib/usageStats';
import { dateISOOf, parseDateISO } from '../../lib/windows';
import { colors, layout, radius, spacing, typography } from '../../theme';

const CHART_WIDTH = 320;
const BAR_CHART_HEIGHT = 120;
const LINE_CHART_HEIGHT = 150;

/**
 * Tab Statistik (v1.2.0, internet-first): grafik batang pemakaian harian
 * untuk periode terpilih (batang bertumpuk seluler + Wi-Fi, ketuk batang
 * untuk rincian hari itu), grafik garis kumulatif TOTAL internet, grafik
 * garis kumulatif seluler terhadap laju ideal paket, dan rincian total,
 * rata-rata hari penuh, hari terboros, serta aplikasi teratas untuk
 * periode itu. Semua grafik digambar dengan react-native-svg — tanpa
 * pustaka grafik baru. Bila belum ada bucket harian, tampil tanggal
 * sejak kapan data mulai terkumpul (T3.6), bukan grafik kosong.
 * Bila data berasal dari snapshot tersimpan (query gagal), cap
 * "terakhir diperbarui" ditampilkan.
 */
export default function StatistikScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const pkg = settings.pkg;
  const { period, setPeriod, customRange, setCustomRange, summary, periodApps, buckets, perAppDaily, bucketsMeta, loading } = useUsage();
  const icons = useAppIcons(periodApps.map((a) => a.packageName));
  // Hari yang dipilih lewat ketukan batang (v1.2.0); null = ikut default
  // (hari ini bila ada di periode, kalau tidak hari terakhir periode).
  const [hariTerpilih, setHariTerpilih] = useState<string | null>(null);

  const rentang = useMemo(
    () => periodToRange(period, undefined, customRange),
    [period, customRange],
  );
  const hariIniISO = dateISOOf(new Date());

  // Bucket dalam periode terpilih, urut naik menurut tanggal.
  const bucketPeriode = useMemo(() => {
    const mulai = dateISOOf(new Date(rentang.start));
    const akhir = dateISOOf(new Date(rentang.end));
    return buckets
      .filter((b) => b.dateISO >= mulai && b.dateISO <= akhir)
      .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
  }, [buckets, rentang]);

  // Bucket dalam jendela paket — bahan grafik kumulatif.
  const bucketPaket = useMemo(() => {
    const mulai = dateISOOf(parseDateISO(pkg.startDate));
    return buckets
      .filter((b) => b.dateISO >= mulai && b.dateISO <= hariIniISO)
      .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
  }, [buckets, pkg.startDate, hariIniISO]);

  // Rincian periode: rata-rata hari PENUH (hari ini parsial dikecualikan),
  // hari terboros (TOTAL internet terbesar), aplikasi teratas (TOTAL
  // internet terbesar). Semua berbasis total internet, bukan seluler saja.
  const rincian = useMemo(() => {
    const hariPenuh = bucketPeriode.filter((b) => b.dateISO < hariIniISO);
    const rataHariPenuh =
      hariPenuh.length > 0
        ? hariPenuh.reduce((s, b) => s + b.mobileBytes + b.wifiBytes, 0) / hariPenuh.length
        : null;
    const terboros =
      bucketPeriode.length > 0
        ? bucketPeriode.reduce((maks, b) =>
            b.mobileBytes + b.wifiBytes > maks.mobileBytes + maks.wifiBytes ? b : maks,
          )
        : null;
    const teratas = periodApps
      .filter((a) => a.packageName !== SYSTEM_ROW_PACKAGE)
      .sort((a, b) => b.bytes - a.bytes)[0];
    return { rataHariPenuh, terboros, teratas, jumlahHariPenuh: hariPenuh.length };
  }, [bucketPeriode, periodApps, hariIniISO]);

  // Hari untuk panel rincian (v1.2.0): pilihan ketukan bila masih di
  // periode, kalau tidak default hari ini / hari terakhir periode.
  const hariDetail = useMemo(() => {
    if (hariTerpilih && bucketPeriode.some((b) => b.dateISO === hariTerpilih)) {
      return hariTerpilih;
    }
    return (
      bucketPeriode.find((b) => b.dateISO === hariIniISO)?.dateISO ??
      bucketPeriode[bucketPeriode.length - 1]?.dateISO ??
      null
    );
  }, [hariTerpilih, bucketPeriode, hariIniISO]);
  const bucketDetail = hariDetail
    ? (bucketPeriode.find((b) => b.dateISO === hariDetail) ?? null)
    : null;
  const appTeratasHari = hariDetail ? topAppForDay(perAppDaily, hariDetail) : null;

  // Kumulatif TOTAL internet (seluler + Wi-Fi) pada periode terpilih.
  const kumulatifTotal = useMemo(
    () =>
      bucketPeriode.reduce<{ dateISO: string; kumulatif: number }[]>((titik, b) => {
        const sebelumnya = titik.length > 0 ? titik[titik.length - 1].kumulatif : 0;
        return [
          ...titik,
          { dateISO: b.dateISO, kumulatif: sebelumnya + b.mobileBytes + b.wifiBytes },
        ];
      }, []),
    [bucketPeriode],
  );
  const maksKumulatifTotal = Math.max(1, ...kumulatifTotal.map((p) => p.kumulatif));
  const titikTotalKeXY = (i: number, nilai: number) => {
    const n = Math.max(1, kumulatifTotal.length - 1);
    return {
      x: 12 + (i / n) * (CHART_WIDTH - 24),
      y: 128 - (nilai / maksKumulatifTotal) * 110,
    };
  };
  const polylineKumulatifTotal = buildPolylinePoints(
    kumulatifTotal.map((p, i) => titikTotalKeXY(i, p.kumulatif)),
  );

  // Grafik kumulatif: titik (tanggal, kumulatif seluler) + garis ideal.
  const kumulatif = useMemo(
    () =>
      bucketPaket.reduce<{ dateISO: string; kumulatif: number; ideal: number }[]>(
        (titik, b) => {
          const sebelumnya = titik.length > 0 ? titik[titik.length - 1].kumulatif : 0;
          const hariKe =
            Math.round(
              (parseDateISO(b.dateISO).getTime() - parseDateISO(pkg.startDate).getTime()) /
                (24 * 60 * 60 * 1000),
            ) + 1;
          const ideal =
            (pkg.quotaBytes * Math.min(hariKe, pkg.durationDays)) / pkg.durationDays;
          return [...titik, { dateISO: b.dateISO, kumulatif: sebelumnya + b.mobileBytes, ideal }];
        },
        [],
      ),
    [bucketPaket, pkg],
  );

  // Tanggal mulai pengumpulan (T3.6) — tanpa Date.now() di render.
  const sejakTerkumpul = bucketsMeta
    ? formatDateID(new Date(bucketsMeta.firstCollectedAt))
    : 'hari ini';

  const maksBatang = Math.max(1, ...bucketPeriode.map((b) => b.mobileBytes + b.wifiBytes));
  const maksKumulatif = Math.max(
    pkg.quotaBytes,
    1,
    ...kumulatif.map((p) => Math.max(p.kumulatif, p.ideal)),
  );
  const slotBatang = bucketPeriode.length > 0 ? CHART_WIDTH / bucketPeriode.length : 0;

  const titikKeXY = (i: number, nilai: number) => {
    const n = Math.max(1, kumulatif.length - 1);
    return {
      x: 12 + (i / n) * (CHART_WIDTH - 24),
      y: 128 - (nilai / maksKumulatif) * 110,
    };
  };

  const polylineKumulatif = buildPolylinePoints(
    kumulatif.map((p, i) => titikKeXY(i, p.kumulatif)),
  );
  const polylineIdeal = buildPolylinePoints(kumulatif.map((p, i) => titikKeXY(i, p.ideal)));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + layout.contentBottomPadding },
        ]}
      >
        <Text style={styles.title}>Statistik</Text>
        <Text style={styles.subtitle}>{periodLabel(period, customRange)}</Text>

        <PeriodSegmentedControl value={period} onChange={setPeriod} />
        {period === 'custom' ? (
          <CustomRangePicker range={customRange} onApply={setCustomRange} />
        ) : null}

        {summary?.fromSnapshot ? (
          <Text style={styles.snapshot}>
            Terakhir diperbarui {formatCapWaktu(summary.updatedAt)}
          </Text>
        ) : null}

        {bucketsMeta?.fromSnapshot ? (
          <Text style={styles.snapshot}>Terakhir diperbarui {formatCapWaktu(bucketsMeta.updatedAt)}</Text>
        ) : null}

        {loading || !summary ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : (
          <>
            <StatCards wifiBytes={summary.wifiBytes} mobileBytes={summary.mobileBytes} />

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Pemakaian harian</Text>
              {bucketPeriode.length === 0 ? (
                <Text style={styles.empty}>
                  Belum ada riwayat harian tersimpan. Data harian mulai terkumpul sejak{' '}
                  {sejakTerkumpul} — grafik muncul setelah pemakaian tercatat.
                </Text>
              ) : (
                <Svg
                  width="100%"
                  viewBox={`0 0 ${CHART_WIDTH} ${BAR_CHART_HEIGHT}`}
                  style={styles.chart}
                  accessibilityLabel="Grafik batang pemakaian harian: seluler dan Wi-Fi per hari"
                >
                  {bucketPeriode.map((b, i) => {
                    const total = b.mobileBytes + b.wifiBytes;
                    const tinggi = total > 0 ? Math.max(4, (total / maksBatang) * 80) : 0;
                    const barWidth = Math.max(4, Math.min(26, slotBatang * 0.6));
                    const x = i * slotBatang + (slotBatang - barWidth) / 2;
                    return (
                      <Rect
                        key={b.dateISO}
                        x={x}
                        y={92 - tinggi}
                        width={barWidth}
                        height={tinggi}
                        rx={4}
                        fill={colors.sageActive}
                        onPress={() => setHariTerpilih(b.dateISO)}
                      />
                    );
                  })}
                  {bucketPeriode.map((b, i) => {
                    const total = b.mobileBytes + b.wifiBytes;
                    const tinggi = total > 0 ? Math.max(4, (total / maksBatang) * 80) : 0;
                    const tinggiSeluler = total > 0 ? (b.mobileBytes / total) * tinggi : 0;
                    const barWidth = Math.max(4, Math.min(26, slotBatang * 0.6));
                    const x = i * slotBatang + (slotBatang - barWidth) / 2;
                    return (
                      <Rect
                        key={`seluler-${b.dateISO}`}
                        x={x}
                        y={92 - tinggiSeluler}
                        width={barWidth}
                        height={tinggiSeluler}
                        rx={4}
                        fill={colors.primary}
                      />
                    );
                  })}
                  {bucketPeriode.map((b, i) => {
                    const langkah = bucketPeriode.length > 14 ? 7 : bucketPeriode.length > 7 ? 2 : 1;
                    if (i % langkah !== 0 && i !== bucketPeriode.length - 1) return null;
                    return (
                      <SvgText
                        key={`label-${b.dateISO}`}
                        x={i * slotBatang + slotBatang / 2}
                        y={108}
                        fontSize={10}
                        fill={colors.secondary}
                        textAnchor="middle"
                      >
                        {b.dateISO.slice(5)}
                      </SvgText>
                    );
                  })}
                  {bucketDetail
                    ? (() => {
                        const i = bucketPeriode.findIndex((b) => b.dateISO === bucketDetail.dateISO);
                        const total = bucketDetail.mobileBytes + bucketDetail.wifiBytes;
                        const tinggi =
                          total > 0 ? Math.max(4, (total / maksBatang) * 80) : 0;
                        const barWidth = Math.max(4, Math.min(26, slotBatang * 0.6));
                        const x = i * slotBatang + (slotBatang - barWidth) / 2;
                        return (
                          <G key="terpilih">
                            <Rect
                              x={x - 2}
                              y={92 - tinggi - 2}
                              width={barWidth + 4}
                              height={tinggi + 4}
                              rx={6}
                              fill="none"
                              stroke={colors.primary}
                              strokeWidth={1.5}
                            />
                            <SvgText
                              x={i * slotBatang + slotBatang / 2}
                              y={Math.max(10, 92 - tinggi - 8)}
                              fontSize={10}
                              fontWeight="700"
                              fill={colors.primary}
                              textAnchor="middle"
                            >
                              {formatBytes(total)}
                            </SvgText>
                          </G>
                        );
                      })()
                    : null}
                </Svg>
              )}
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
              {bucketDetail ? (
                <View style={styles.dayDetail}>
                  <Text style={styles.dayDetailTitle}>
                    Rincian {formatDateID(parseDateISO(bucketDetail.dateISO))}
                  </Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Seluler</Text>
                    <Text style={styles.detailValue}>{formatBytes(bucketDetail.mobileBytes)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Wi-Fi</Text>
                    <Text style={styles.detailValue}>{formatBytes(bucketDetail.wifiBytes)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Total</Text>
                    <Text style={styles.detailValue}>
                      {formatBytes(bucketDetail.mobileBytes + bucketDetail.wifiBytes)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Aplikasi teratas</Text>
                    <Text style={styles.detailValue}>
                      {appTeratasHari
                        ? `${appTeratasHari.label} · ${formatBytes(appTeratasHari.bytes)}`
                        : 'Belum ada data per aplikasi hari itu'}
                    </Text>
                  </View>
                  <Text style={styles.hint}>Ketuk batang lain untuk melihat rincian hari itu.</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Kumulatif internet</Text>
              {kumulatifTotal.length === 0 ? (
                <Text style={styles.empty}>
                  Belum ada riwayat harian pada periode terpilih.
                </Text>
              ) : (
                <>
                  <Svg
                    width="100%"
                    viewBox={`0 0 ${CHART_WIDTH} ${LINE_CHART_HEIGHT}`}
                    style={styles.chart}
                    accessibilityLabel="Grafik garis kumulatif total internet pada periode terpilih"
                  >
                    <Line x1={12} y1={128} x2={CHART_WIDTH - 12} y2={128} stroke={colors.sageLight} strokeWidth={1} />
                    <Polyline
                      points={polylineKumulatifTotal}
                      fill="none"
                      stroke={colors.primary}
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {kumulatifTotal.map((p, i) => {
                      const { x, y } = titikTotalKeXY(i, p.kumulatif);
                      return <Circle key={p.dateISO} cx={x} cy={y} r={3} fill={colors.primary} />;
                    })}
                    <SvgText x={12} y={16} fontSize={10} fill={colors.secondary}>
                      {formatBytes(maksKumulatifTotal)}
                    </SvgText>
                  </Svg>
                  <Text style={styles.note}>
                    Total internet kumulatif (seluler + Wi-Fi) pada periode terpilih.
                  </Text>
                </>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Kumulatif terhadap laju ideal paket</Text>
              {kumulatif.length === 0 ? (
                <Text style={styles.empty}>
                  Belum ada riwayat harian dalam jendela paket berjalan. Data harian mulai
                  terkumpul sejak {sejakTerkumpul}.
                </Text>
              ) : (
                <>
                  <Svg
                    width="100%"
                    viewBox={`0 0 ${CHART_WIDTH} ${LINE_CHART_HEIGHT}`}
                    style={styles.chart}
                    accessibilityLabel="Grafik garis kumulatif seluler terpakai terhadap garis laju ideal paket"
                  >
                    <Line x1={12} y1={128} x2={CHART_WIDTH - 12} y2={128} stroke={colors.sageLight} strokeWidth={1} />
                    <Polyline
                      points={polylineIdeal}
                      fill="none"
                      stroke={colors.warning}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                    />
                    <Polyline
                      points={polylineKumulatif}
                      fill="none"
                      stroke={colors.primary}
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {kumulatif.map((p, i) => {
                      const { x, y } = titikKeXY(i, p.kumulatif);
                      return <Circle key={p.dateISO} cx={x} cy={y} r={3} fill={colors.primary} />;
                    })}
                    <SvgText x={12} y={16} fontSize={10} fill={colors.secondary}>
                      {formatBytes(maksKumulatif)}
                    </SvgText>
                  </Svg>
                  <View style={styles.legend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                      <Text style={styles.legendText}>Kumulatif terpakai</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                      <Text style={styles.legendText}>Laju ideal paket</Text>
                    </View>
                  </View>
                  <Text style={styles.note}>
                    Garis laju ideal = pemakaian kumulatif ideal bila pemakaian merata
                    (kuota × persen waktu berjalan).
                  </Text>
                </>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Rincian {periodLabel(period, customRange).toLowerCase()}</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total</Text>
                <Text style={styles.detailValue}>{formatBytes(summary.totalBytes)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Rata-rata hari penuh</Text>
                <Text style={styles.detailValue}>
                  {rincian.rataHariPenuh === null
                    ? 'Belum ada hari penuh tercatat'
                    : `${formatBytes(rincian.rataHariPenuh)} (${rincian.jumlahHariPenuh} hari)`}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Hari terboros</Text>
                <Text style={styles.detailValue}>
                  {rincian.terboros
                    ? `${formatBytes(rincian.terboros.mobileBytes + rincian.terboros.wifiBytes)} · ${formatDateID(parseDateISO(rincian.terboros.dateISO))}`
                    : 'Belum tercatat'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Aplikasi teratas</Text>
                {rincian.teratas ? (
                  <View style={styles.topApp}>
                    <AppIcon
                      iconBase64={icons[rincian.teratas.packageName]?.iconBase64}
                      label={rincian.teratas.label}
                      size={28}
                    />
                    <Text style={styles.detailValue}>
                      {rincian.teratas.label} · {formatBytes(rincian.teratas.bytes)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.detailValue}>Belum tercatat</Text>
                )}
              </View>
            </View>

            <Text style={styles.note}>
              {summary.source === 'native'
                ? 'Data asli dari perangkat.'
                : summary.source === 'snapshot'
                  ? 'Data tersimpan dari query terakhir.'
                  : summary.source === 'empty'
                    ? 'Belum ada data tersimpan — beri izin akses penggunaan untuk angka asli.'
                    : 'Data contoh — modul native tidak tersedia di lingkungan ini.'}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.ink,
  },
  subtitle: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  loader: {
    marginTop: 48,
  },
  snapshot: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  cardTitle: {
    ...typography.heading,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  chart: {
    marginTop: spacing.sm,
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
  note: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  empty: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailLabel: {
    ...typography.body,
    color: colors.secondary,
    flex: 1,
  },
  detailValue: {
    ...typography.body,
    color: colors.ink,
    textAlign: 'right',
    flex: 1,
  },
  topApp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'flex-end',
  },
  dayDetail: {
    borderTopWidth: 1,
    borderTopColor: colors.sageLight,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  dayDetailTitle: {
    ...typography.label,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
});
