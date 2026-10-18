import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { formatCapWaktu, formatDateID, formatGB } from '../lib/format';
import { computeQuota, packageLastDay } from '../lib/quota';
import { useSettings } from '../lib/settings';
import { useUsage } from '../lib/usage';
import { openUsageAccessSettings } from '../lib/usageStats';
import { colors, radius, spacing, typography } from '../theme';

const PAGE_COUNT = 4;

const PROMISES = [
  {
    title: 'Pantau per aplikasi',
    desc: 'Lihat aplikasi mana yang paling banyak memakai kuota selulermu, tanpa menebak-nebak.',
  },
  {
    title: 'Prediksi habis',
    desc: 'Perkiraan kapan kuotamu habis, dihitung dari rata-rata pemakaianmu sendiri.',
  },
  {
    title: 'Peringatan sebelum kritis',
    desc: 'Diberi tahu sebelum kuota kritis, supaya kamu sempat mengatur pemakaian.',
  },
];

/** Ring kecil persen terpakai pada kartu kaca welcome (T4.4): busur
 *  beranimasi ~500ms menuju persen baru (Animated bawaan RN, tanpa
 *  Reanimated). Angka persen tampil seketika; hanya busur yang bergerak. */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function MiniRing({ percent }: { percent: number }) {
  const size = 60;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const keliling = 2 * Math.PI * r;
  const nilai = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(nilai, {
      toValue: Math.max(0, Math.min(1, percent / 100)),
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [percent, nilai]);

  // Busur digambar penuh (dasharray = keliling), lalu disembunyikan
  // sebagian lewat dashoffset yang dianimasikan 0 -> keliling.
  const offset = nilai.interpolate({
    inputRange: [0, 1],
    outputRange: [keliling, 0],
  });

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`${Math.round(percent)}% terpakai`}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.sageActive}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.progress}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={keliling}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.ringText}>{Math.round(percent)}%</Text>
    </View>
  );
}

/** Ikon sinyal kecil di dalam chip "Kuota, Terkendali". */
function SignalIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill={colors.primary}>
      <Circle cx="3" cy="13" r="1.6" />
      <Circle cx="8" cy="10" r="1.6" />
      <Circle cx="13" cy="6" r="1.6" />
    </Svg>
  );
}

/**
 * Layar pertama (T1.2 + T1.3): carousel 4 halaman di atas aset latar
 * bergelombang sage. Halaman 1 = susunan referensi (chip, judul serif,
 * subjudul, kartu kaca kuota utama, indikator titik, tombol pill hitam).
 * Halaman 2–4 = tiga janji yang memang bisa dipenuhi aplikasi. Halaman
 * terakhir memuat alur izin akses penggunaan.
 *
 * Kartu kaca memakai satu sumber kebenaran yang sama dengan Beranda
 * (prinsip 1): computeQuota dari pemakaian SELULER saja.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { settings, markWelcomeSeen } = useSettings();
  const pkg = settings.pkg;
  const { quotaSummary, nativeStatus, buckets, refresh } = useUsage();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<number>>(null);

  // Transisi welcome (T4.4, Animated bawaan RN): kartu kaca naik +
  // memudar masuk sekali saat layar tampil; footer (titik + tombol)
  // memudar singkat tiap pindah halaman. Geser antar halaman sendiri
  // sudah beranimasi lewat paging FlatList.
  // Nilai animasi disimpan di state (bukan ref): dipakai saat render.
  const [masuk] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(masuk, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [masuk]);
  const [footerFade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    footerFade.setValue(0.4);
    Animated.timing(footerFade, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [page, footerFade]);
  const naikKaca = masuk.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  const quotaState = useMemo(
    () => (quotaSummary ? computeQuota(pkg, quotaSummary.mobileBytes, new Date(), buckets) : null),
    [pkg, quotaSummary, buckets],
  );

  // Kembali dari Settings (sistem): status izin dicek ulang begitu
  // aplikasi aktif lagi — layar welcome tidak perlu dibuka ulang.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const selesai = async () => {
    try {
      await markWelcomeSeen();
    } catch {
      // Gagal menandai welcome — tetap masuk Beranda; welcome akan
      // tampil lagi pada pembukaan berikutnya.
    }
    router.replace('/');
  };

  const keHalaman = (index: number) => {
    setPage(index);
    try {
      listRef.current?.scrollToIndex({ index, animated: true });
    } catch {
      // Indeks di luar jangkauan — abaikan, posisi tetap di halaman aktif.
    }
  };

  const akhir = packageLastDay(pkg);
  const izinPerluDibuka = nativeStatus.available && !nativeStatus.granted;

  const renderHalaman = (index: number) => {
    if (index === 0) {
      return (
        <View style={[styles.page, { width }]}>
          <View style={styles.pageTop}>
            <View style={styles.chip}>
              <SignalIcon />
              <Text style={styles.chipText}>Kuota, Terkendali</Text>
            </View>
            <Text style={styles.title}>
              Tetap Terhubung,{'\n'}
              <Text style={styles.titleItalic}>Tanpa Khawatir.</Text>
            </Text>
            <Text style={styles.subtitle}>Pantau penggunaan internetmu setiap hari.</Text>
          </View>

          <Animated.View style={[styles.glass, { opacity: masuk, transform: [{ translateY: naikKaca }] }]}>
            <View style={styles.glassHeader}>
              <Text style={styles.glassLabel}>Kuota Utama</Text>
              <View style={styles.networkChip}>
                <Text style={styles.networkChipText}>{pkg.network}</Text>
              </View>
            </View>
            <Text style={styles.operatorText}>{pkg.operator}</Text>
            {!quotaState ? (
              <Text style={styles.loading}>Memuat pemakaian…</Text>
            ) : (
              <>
                <View style={styles.glassMain}>
                  <View style={styles.glassMainText}>
                    <Text style={styles.glassBig}>
                      {formatGB(quotaState.remainingBytes)} tersisa
                    </Text>
                    <Text style={styles.glassTotal}>
                      dari {formatGB(pkg.quotaBytes)} · {Math.round(quotaState.usedPercent)}%
                      terpakai
                    </Text>
                  </View>
                  <MiniRing percent={quotaState.usedPercent} />
                </View>
                <Text style={styles.glassDate}>
                  Berlaku sampai {formatDateID(akhir)} ›
                </Text>
                {quotaSummary?.source === 'sample' ? (
                  <Text style={styles.sampleNote}>
                    Data contoh — beri izin akses penggunaan untuk angka asli.
                  </Text>
                ) : null}
                {quotaSummary?.fromSnapshot ? (
                  <Text style={styles.snapshotNote}>
                    Terakhir diperbarui {formatCapWaktu(quotaSummary.updatedAt)}
                  </Text>
                ) : null}
                {quotaSummary?.source === 'empty' ? (
                  <Text style={styles.sampleNote}>
                    Belum ada data tersimpan — beri izin akses penggunaan untuk angka asli.
                  </Text>
                ) : null}
              </>
            )}
          </Animated.View>
        </View>
      );
    }

    const janji = PROMISES[index - 1];
    return (
      <View style={[styles.promisePage, { width }]}>
        <View style={styles.promiseIcon}>
          <Text style={styles.promiseIconText}>{index + 1}</Text>
        </View>
        <Text style={styles.promiseTitle}>{janji.title}</Text>
        <Text style={styles.promiseDesc}>{janji.desc}</Text>
        {index === PAGE_COUNT - 1 ? (
          <View style={styles.permissionBox}>
            {!nativeStatus.available ? (
              <Text style={styles.permissionText}>
                Di lingkungan ini modul native tidak tersedia, jadi angka memakai data contoh
                yang berlabel jelas. Kamu tetap bisa memakai aplikasi.
              </Text>
            ) : nativeStatus.granted ? (
              <Text style={styles.permissionText}>
                Izin akses penggunaan sudah diberikan — angka memakai data asli perangkat.
              </Text>
            ) : (
              <Text style={styles.permissionText}>
                Untuk angka asli, Kuota Tracker perlu izin akses penggunaan. Izin ini hanya
                dipakai membaca pemakaian datamu di perangkat ini. Kamu bisa kembali ke sini
                setelah memberi izin; statusnya dicek ulang otomatis.
              </Text>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ImageBackground
      source={require('../../assets/welcome-bg.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={[styles.shell, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <FlatList
          ref={listRef}
          data={[0, 1, 2, 3]}
          keyExtractor={(i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(e) => {
            setPage(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
          renderItem={({ item }) => renderHalaman(item)}
        />

        <Animated.View style={[styles.footer, { opacity: footerFade }]}>
          <View style={styles.dots}>
            {Array.from({ length: PAGE_COUNT }, (_, i) => (
              <Pressable
                key={i}
                onPress={() => keHalaman(i)}
                accessibilityRole="button"
                accessibilityLabel={`Ke halaman ${i + 1}`}
                accessibilityState={{ selected: page === i }}
                style={styles.dotHit}
              >
                <View style={[styles.dot, page === i && styles.dotActive]} />
              </Pressable>
            ))}
          </View>

          {page === 0 ? (
            <Pressable style={styles.button} onPress={selesai} hitSlop={4}>
              <Text style={styles.buttonText}>Lihat Penggunaan →</Text>
            </Pressable>
          ) : page === PAGE_COUNT - 1 ? (
            <>
              {izinPerluDibuka ? (
                <>
                  <Pressable style={styles.button} onPress={openUsageAccessSettings} hitSlop={4}>
                    <Text style={styles.buttonText}>Buka Pengaturan Izin</Text>
                  </Pressable>
                  <Pressable style={styles.skip} onPress={selesai} hitSlop={4}>
                    <Text style={styles.skipText}>Lewati dulu</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable style={styles.button} onPress={selesai} hitSlop={4}>
                  <Text style={styles.buttonText}>Lihat Penggunaan →</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={styles.hint}>Geser untuk lanjut ›</Text>
          )}
        </Animated.View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  shell: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.sm,
  },
  pageTop: {
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipText: {
    ...typography.label,
    color: colors.primary,
  },
  title: {
    ...typography.display,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  titleItalic: {
    ...typography.displayItalic,
    color: colors.primary,
  },
  subtitle: {
    ...typography.body,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  glass: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.xxl,
    padding: spacing.xl,
  },
  glassHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glassLabel: {
    ...typography.label,
    color: colors.secondary,
  },
  networkChip: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  networkChipText: {
    ...typography.label,
    color: colors.ink,
  },
  operatorText: {
    ...typography.bodyBold,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  glassMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  glassMainText: {
    flex: 1,
  },
  glassBig: {
    ...typography.bigNumber,
    color: colors.ink,
  },
  glassTotal: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  glassDate: {
    ...typography.body,
    color: colors.ink,
    marginTop: spacing.md,
  },
  sampleNote: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
  snapshotNote: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  loading: {
    ...typography.body,
    color: colors.secondary,
    marginTop: spacing.md,
  },
  ringText: {
    position: 'absolute',
    ...typography.caption,
    color: colors.ink,
  },
  promisePage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingBottom: spacing.xxxl,
  },
  promiseIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promiseIconText: {
    ...typography.display,
    color: colors.primary,
  },
  promiseTitle: {
    ...typography.title,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  promiseDesc: {
    ...typography.body,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  permissionBox: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.xxl,
  },
  permissionText: {
    ...typography.body,
    color: colors.ink,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  // Target sentuh titik (T4.5): visual 8dp, area sentuh 44x44.
  dotHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.sageActive,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.label,
    color: colors.onPrimary,
  },
  skip: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    ...typography.label,
    color: colors.primary,
  },
  hint: {
    ...typography.label,
    color: colors.secondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
