import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import AppIcon from '../components/AppIcon';
import { useAppIcons } from '../lib/appIcons';
import {
  aggregateDailyAppBuckets,
  compareWithPrevious,
  type AppDailyPoint,
} from '../lib/appUsage';
import { formatBytes, formatCapWaktu, formatPercent } from '../lib/format';
import { useSettings } from '../lib/settings';
import {
  getAppUsageForRange,
  getDailyAppBuckets,
  getDeviceUsageForRange,
  type AppUsage,
} from '../lib/usageStats';
import { packageWindow } from '../lib/windows';
import { colors, radius, spacing, typography } from '../theme';

type DetailData = {
  /** Pemakaian aplikasi ini pada jendela paket berjalan. */
  sekarang: AppUsage | null;
  /** Pemakaian aplikasi ini pada jendela sebelumnya (durasi sama, sebelum paket mulai). */
  sebelumnya: AppUsage | null;
  /** Total seluler perangkat pada jendela paket — penyebut pangsa. */
  totalSelulerPerangkat: number;
  /** Deret harian aplikasi ini selama paket berjalan. */
  harian: AppDailyPoint[];
  /** True bila modul native tidak tersedia (Expo Go). */
  tanpaNative: boolean;
  /** Cap waktu snapshot bila angka berasal dari snapshot tersimpan (T3.6). */
  capWaktu: number | null;
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 110;

/** Teks perbandingan dengan periode sebelumnya (seluler). */
function teksPerbandingan(sekarang: number, sebelumnya: AppUsage | null): string {
  if (!sebelumnya) return 'Belum ada periode sebelumnya untuk dibandingkan.';
  const banding = compareWithPrevious(sekarang, sebelumnya.mobileBytes);
  if (banding.deltaPercent === null) {
    return sebelumnya.mobileBytes <= 0 && sekarang <= 0
      ? 'Tidak ada pemakaian seluler pada kedua periode.'
      : `Periode sebelumnya: ${formatBytes(sebelumnya.mobileBytes)} seluler.`;
  }
  const arah = banding.naik === null ? 'Sama' : banding.naik ? 'Naik' : 'Turun';
  return `${arah} ${Math.abs(Math.round(banding.deltaPercent))}% dari periode sebelumnya (${formatBytes(sebelumnya.mobileBytes)} seluler).`;
}

/**
 * Detail aplikasi (T3.4): ikon besar, total seluler dan Wi-Fi pada
 * jendela paket berjalan, grafik harian aplikasi itu selama paket
 * berjalan (batang bertumpuk seluler + Wi-Fi), pangsa terhadap total
 * seluler perangkat, dan perbandingan dengan periode sebelumnya.
 * Nama paket mentah tampil DI SINI — satu-satunya tempat di daftar
 * aplikasi yang menampilkannya.
 *
 * TIDAK ADA tombol blokir / batasi di layar ini: Android tidak
 * mengizinkan aplikasi pihak ketiga membatasi aplikasi lain.
 */
export default function AppDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ packageName?: string; label?: string }>();
  const packageName = params.packageName ?? '';
  const labelParam = params.label ?? '';
  const { settings } = useSettings();
  const icons = useAppIcons(packageName === '' ? [] : [packageName]);
  const [data, setData] = useState<DetailData | null>(null);

  useEffect(() => {
    let aktif = true;
    async function muat() {
      const jendela = packageWindow(settings.pkg.startDate);
      const durasi = Math.max(0, jendela.end - jendela.start);
      const [appsSekarang, appsSebelumnya, perangkat, bucketHarian] = await Promise.all([
        getAppUsageForRange(jendela.start, jendela.end, 200),
        durasi > 0
          ? getAppUsageForRange(jendela.start - durasi, jendela.start, 200)
          : Promise.resolve([] as AppUsage[]),
        getDeviceUsageForRange(jendela.start, jendela.end),
        getDailyAppBuckets(jendela.start, jendela.end, 50),
      ]);
      if (!aktif) return;
      const sekarang = appsSekarang.find((a) => a.packageName === packageName) ?? null;
      const sebelumnya =
        appsSebelumnya.find((a) => a.packageName === packageName) ?? null;
      setData({
        sekarang,
        sebelumnya: durasi > 0 ? sebelumnya : null,
        totalSelulerPerangkat: perangkat.mobileBytes,
        harian: aggregateDailyAppBuckets(bucketHarian ?? [], packageName),
        tanpaNative: perangkat.source !== 'native' && appsSekarang.length === 0,
        // Cap snapshot: perangkat + daftar per aplikasi berasal dari
        // snapshot yang sama bila query native gagal (T3.6).
        capWaktu: perangkat.fromSnapshot ? perangkat.updatedAt : null,
      });
    }
    void muat();
    return () => {
      aktif = false;
    };
  }, [packageName, settings.pkg.startDate]);

  const label = labelParam || data?.sekarang?.label || packageName;
  const maksHarian = Math.max(
    1,
    ...((data?.harian ?? []).map((d) => d.mobileBytes + d.wifiBytes) ?? [1]),
  );
  const slotWidth = data && data.harian.length > 0 ? CHART_WIDTH / data.harian.length : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Kembali"
      >
        <Text style={styles.backText}>‹ Kembali</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        {packageName === '' ? (
          <Text style={styles.error}>Data aplikasi tidak ditemukan.</Text>
        ) : !data ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : (
          <>
            <View style={styles.header}>
              <AppIcon
                iconBase64={icons[packageName]?.iconBase64}
                label={label}
                size={72}
              />
              <Text style={styles.title}>{label}</Text>
              <Text style={styles.package}>{packageName}</Text>
            </View>

            {!data.sekarang ? (
              <Text style={styles.empty}>
                {data.tanpaNative
                  ? 'Data asli tidak tersedia — beri izin akses penggunaan untuk data asli.'
                  : 'Tidak ada pemakaian tercatat untuk aplikasi ini pada jendela paket berjalan.'}
              </Text>
            ) : (
              <>
                {data.capWaktu !== null ? (
                  <Text style={styles.snapshot}>
                    Terakhir diperbarui {formatCapWaktu(data.capWaktu)}
                  </Text>
                ) : null}
                <View style={styles.row}>
                  <View style={styles.card}>
                    <Text style={styles.cardLabel}>Seluler</Text>
                    <Text style={styles.cardBig}>{formatBytes(data.sekarang.mobileBytes)}</Text>
                    <Text style={styles.cardRow}>
                      {formatPercent(data.sekarang.mobileBytes, data.totalSelulerPerangkat)} dari total
                      seluler
                    </Text>
                  </View>
                  <View style={styles.card}>
                    <Text style={styles.cardLabel}>Wi-Fi</Text>
                    <Text style={styles.cardBig}>{formatBytes(data.sekarang.wifiBytes)}</Text>
                    <Text style={styles.cardRow}>
                      Total {formatBytes(data.sekarang.bytes)} pada paket berjalan
                    </Text>
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Perbandingan periode sebelumnya</Text>
                  <Text style={styles.cardRow}>
                    {teksPerbandingan(data.sekarang.mobileBytes, data.sebelumnya)}
                  </Text>
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Pemakaian harian selama paket berjalan</Text>
                  {data.harian.length === 0 ? (
                    <Text style={styles.cardRow}>Belum ada riwayat harian untuk aplikasi ini.</Text>
                  ) : (
                    <>
                      <Svg
                        width="100%"
                        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                        style={styles.chart}
                        accessibilityLabel={`Grafik batang harian ${label}: seluler dan Wi-Fi per hari`}
                      >
                        {data.harian.map((d, i) => {
                          const total = d.mobileBytes + d.wifiBytes;
                          const tinggiTotal = total > 0 ? Math.max(4, (total / maksHarian) * 72) : 0;
                          const barWidth = Math.max(4, Math.min(26, slotWidth * 0.6));
                          const x = i * slotWidth + (slotWidth - barWidth) / 2;
                          return (
                            <Rect
                              key={d.dateISO}
                              x={x}
                              y={84 - tinggiTotal}
                              width={barWidth}
                              height={tinggiTotal}
                              rx={4}
                              fill={colors.sageActive}
                            />
                          );
                        })}
                        {data.harian.map((d, i) => {
                          const total = d.mobileBytes + d.wifiBytes;
                          const tinggiTotal = total > 0 ? Math.max(4, (total / maksHarian) * 72) : 0;
                          const tinggiSeluler =
                            total > 0 ? (d.mobileBytes / total) * tinggiTotal : 0;
                          const barWidth = Math.max(4, Math.min(26, slotWidth * 0.6));
                          const x = i * slotWidth + (slotWidth - barWidth) / 2;
                          return (
                            <Rect
                              key={`seluler-${d.dateISO}`}
                              x={x}
                              y={84 - tinggiSeluler}
                              width={barWidth}
                              height={tinggiSeluler}
                              rx={4}
                              fill={colors.primary}
                            />
                          );
                        })}
                        {data.harian.map((d, i) => {
                          // Label tanggal hanya tiap titik yang muat — untuk
                          // deret panjang, tampilkan tanggal tiap kelipatan.
                          const langkah = data.harian.length > 14 ? 7 : data.harian.length > 7 ? 2 : 1;
                          if (i % langkah !== 0 && i !== data.harian.length - 1) return null;
                          return (
                            <SvgText
                              key={`label-${d.dateISO}`}
                              x={i * slotWidth + slotWidth / 2}
                              y={100}
                              fontSize={10}
                              fill={colors.secondary}
                              textAnchor="middle"
                            >
                              {d.dateISO.slice(5)}
                            </SvgText>
                          );
                        })}
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
                    </>
                  )}
                </View>
              </>
            )}
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
  back: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    ...typography.label,
    color: colors.primary,
  },
  content: {
    padding: spacing.lg,
  },
  loader: {
    marginTop: 48,
  },
  error: {
    ...typography.body,
    color: colors.critical,
  },
  empty: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.ink,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  package: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
    flex: 1,
  },
  cardLabel: {
    ...typography.label,
    color: colors.secondary,
  },
  cardBig: {
    ...typography.bigNumber,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  cardRow: {
    ...typography.body,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  snapshot: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.sm,
    textAlign: 'center',
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
