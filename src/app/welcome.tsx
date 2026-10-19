import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { formatBytes, formatCapWaktu, formatDateID, GB } from '../lib/format';
import { useSettings } from '../lib/settings';
import { useUsage } from '../lib/usage';
import { openUsageAccessSettings } from '../lib/usageStats';
import { dateISOOf } from '../lib/windows';
import { colors, radius, spacing, typography } from '../theme';

const PAGE_COUNT = 6;

const PROMISES = [
  {
    title: 'Total internetmu',
    desc: 'Seluler + Wi-Fi dalam satu angka — total hari ini, kemarin, dan 7 hari terakhir, tanpa menebak-nebak.',
  },
  {
    title: 'Pantau per aplikasi',
    desc: 'Lihat aplikasi mana yang paling banyak memakai internetmu, seluler dan Wi-Fi.',
  },
  {
    title: 'Pengingat sebelum kebablasan',
    desc: 'Diberi tahu saat pemakaian harian, pemakaian per aplikasi, atau kuota seluler mendekati batas.',
  },
];

/** Ikon sinyal kecil di dalam chip "Internet, Terkendali". */
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
 * (prinsip 1): total internet hari ini dari data harian — bukan kuota.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { settings, markWelcomeSeen, updatePackage } = useSettings();
  const pkg = settings.pkg;
  const { daily, nativeStatus, refresh } = useUsage();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<number>>(null);

  // Form paket onboarding (halaman 4): draf lokal, disimpan lewat
  // tombol — bukan onBlur — supaya jelas kapan paket tersimpan.
  // Tanpa paket aktif, form mulai dari bawaan (13 GB / 5 hari).
  const [namaPaket, setNamaPaket] = useState(pkg?.name ?? 'Kuota Utama');
  const [kuotaGB, setKuotaGB] = useState(
    String(Math.round((pkg?.quotaBytes ?? 13 * GB) / GB)),
  );
  const [durasiHari, setDurasiHari] = useState(String(pkg?.durationDays ?? 5));
  const [tanggalMulai, setTanggalMulai] = useState(
    pkg ? new Date(pkg.startDate) : new Date(),
  );
  const [tampilPilihTanggal, setTampilPilihTanggal] = useState(false);
  const [errorPaket, setErrorPaket] = useState<string | null>(null);
  const [menyimpanPaket, setMenyimpanPaket] = useState(false);

  const simpanPaketOnboarding = () => {
    const kuota = Number(kuotaGB.replace(',', '.'));
    const durasi = Number(durasiHari);
    if (!Number.isFinite(kuota) || kuota <= 0) {
      setErrorPaket('Isi kuota dengan angka lebih dari 0 (GB).');
      return;
    }
    if (!Number.isInteger(durasi) || durasi <= 0) {
      setErrorPaket('Isi durasi dengan jumlah hari bulat lebih dari 0.');
      return;
    }
    setErrorPaket(null);
    setMenyimpanPaket(true);
    const dasar = pkg ?? {
      name: 'Kuota Utama',
      quotaBytes: 13 * GB,
      startDate: dateISOOf(new Date()),
      durationDays: 5,
      operator: 'Telkomsel',
      network: '4G/5G',
    };
    updatePackage({
      ...dasar,
      name: namaPaket.trim() || dasar.name,
      quotaBytes: kuota * GB,
      startDate: dateISOOf(tanggalMulai),
      durationDays: durasi,
    })
      .then(() => keHalaman(PAGE_COUNT - 1))
      .catch(() => setErrorPaket('Gagal menyimpan paket — coba lagi.'))
      .finally(() => setMenyimpanPaket(false));
  };

  const pilihTanggalMulai = (_event: DateTimePickerEvent, dipilih?: Date) => {
    setTampilPilihTanggal(false);
    if (dipilih) setTanggalMulai(dipilih);
  };

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

  const izinPerluDibuka = nativeStatus.available && !nativeStatus.granted;

  const renderHalaman = (index: number) => {
    if (index === 0) {
      // Angka kartu kaca = angka Beranda (InternetTodayCard): total
      // hari ini + pecahan + total kemarin seharian.
      const hariIni = daily?.last7Days.find((d) => d.isToday);
      const totalHariIni = (hariIni?.mobileBytes ?? 0) + (hariIni?.wifiBytes ?? 0);
      const kemarin =
        daily && daily.last7Days.length >= 2
          ? daily.last7Days[daily.last7Days.length - 2]
          : undefined;
      const totalKemarin = kemarin ? kemarin.mobileBytes + kemarin.wifiBytes : null;
      return (
        <View style={[styles.page, { width }]}>
          <View style={styles.pageTop}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logo}
              accessibilityLabel="Logo Internet Tracker"
            />
            <View style={styles.chip}>
              <SignalIcon />
              <Text style={styles.chipText}>Internet, Terkendali</Text>
            </View>
            <Text style={styles.title}>
              Tetap Terhubung,{'\n'}
              <Text style={styles.titleItalic}>Tanpa Khawatir.</Text>
            </Text>
            <Text style={styles.subtitle}>Pantau penggunaan internetmu setiap hari.</Text>
          </View>

          <Animated.View style={[styles.glass, { opacity: masuk, transform: [{ translateY: naikKaca }] }]}>
            <View style={styles.glassHeader}>
              <Text style={styles.glassLabel}>Internet hari ini</Text>
            </View>
            {!daily ? (
              <Text style={styles.loading}>Memuat pemakaian…</Text>
            ) : (
              <>
                <View style={styles.glassMain}>
                  <View style={styles.glassMainText}>
                    <Text style={styles.glassBig}>{formatBytes(totalHariIni)}</Text>
                    <Text style={styles.glassTotal}>
                      Seluler {formatBytes(hariIni?.mobileBytes ?? 0)} · Wi-Fi{' '}
                      {formatBytes(hariIni?.wifiBytes ?? 0)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.glassDate}>
                  {totalKemarin === null
                    ? 'Kemarin belum tercatat'
                    : `Kemarin total ${formatBytes(totalKemarin)} (seharian)`}
                </Text>
                {daily.source === 'sample' ? (
                  <Text style={styles.sampleNote}>
                    Data contoh — beri izin akses penggunaan untuk angka asli.
                  </Text>
                ) : null}
                {daily.fromSnapshot ? (
                  <Text style={styles.snapshotNote}>
                    Terakhir diperbarui {formatCapWaktu(daily.updatedAt)}
                  </Text>
                ) : null}
              </>
            )}
          </Animated.View>
        </View>
      );
    }

    if (index === PAGE_COUNT - 2) {
      // Halaman setup paket (5): isi paket pertama di sini — bukan
      // setelah masuk Beranda — supaya seksi paket seluler langsung berangka.
      return (
        <View style={[styles.formPage, { width }]}>
          <Text style={styles.promiseTitle}>Atur paket pertamamu</Text>
          <Text style={styles.promiseDesc}>
            Isi paket yang sedang berjalan. Bisa diubah lagi kapan pun di Pengaturan.
          </Text>
          <Text style={styles.formLabel}>Nama paket</Text>
          <TextInput
            style={styles.formInput}
            value={namaPaket}
            onChangeText={setNamaPaket}
            placeholder="Kuota Utama"
            placeholderTextColor={colors.secondary}
            maxLength={40}
            accessibilityLabel="Nama paket"
          />
          <Text style={styles.formLabel}>Kuota (GB)</Text>
          <TextInput
            style={styles.formInput}
            value={kuotaGB}
            onChangeText={setKuotaGB}
            placeholder="13"
            placeholderTextColor={colors.secondary}
            keyboardType="decimal-pad"
            accessibilityLabel="Kuota dalam GB"
          />
          <Text style={styles.formLabel}>Durasi (hari)</Text>
          <TextInput
            style={styles.formInput}
            value={durasiHari}
            onChangeText={setDurasiHari}
            placeholder="5"
            placeholderTextColor={colors.secondary}
            keyboardType="number-pad"
            accessibilityLabel="Durasi paket dalam hari"
          />
          <Text style={styles.formLabel}>Tanggal mulai</Text>
          <Pressable
            style={styles.formInput}
            onPress={() => setTampilPilihTanggal(true)}
            accessibilityRole="button"
            accessibilityLabel={`Tanggal mulai paket, saat ini ${formatDateID(tanggalMulai)}`}
          >
            <Text style={styles.formInputText}>{formatDateID(tanggalMulai)}</Text>
          </Pressable>
          {tampilPilihTanggal ? (
            <DateTimePicker value={tanggalMulai} mode="date" onChange={pilihTanggalMulai} />
          ) : null}
          {errorPaket ? <Text style={styles.formError}>{errorPaket}</Text> : null}
          <Pressable
            style={[styles.button, styles.formButton]}
            onPress={simpanPaketOnboarding}
            hitSlop={4}
            disabled={menyimpanPaket}
          >
            <Text style={styles.buttonText}>
              {menyimpanPaket ? 'Menyimpan…' : 'Simpan paket & lanjut'}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (index === PAGE_COUNT - 1) {
      // Halaman izin (6): khusus izin akses penggunaan — bukan lagi
      // menumpang di halaman janji terakhir.
      return (
        <View style={[styles.promisePage, { width }]}>
          <View style={styles.promiseIcon}>
            <Text style={styles.promiseIconText}>✓</Text>
          </View>
          <Text style={styles.promiseTitle}>Izin akses penggunaan</Text>
          <Text style={styles.promiseDesc}>
            Untuk angka asli, Internet Tracker perlu izin akses penggunaan. Izin ini hanya
            dipakai membaca pemakaian datamu di perangkat ini.
          </Text>
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
                Kamu bisa kembali ke sini setelah memberi izin; statusnya dicek ulang
                otomatis.
              </Text>
            )}
          </View>
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
          data={[0, 1, 2, 3, 4, 5]}
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
          ) : page === PAGE_COUNT - 2 ? (
            <Pressable style={styles.skip} onPress={() => keHalaman(PAGE_COUNT - 1)} hitSlop={4}>
              <Text style={styles.skipText}>Lewati dulu</Text>
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
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: spacing.lg,
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
  formPage: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingBottom: spacing.xxxl,
  },
  formLabel: {
    ...typography.label,
    color: colors.ink,
    marginTop: spacing.lg,
  },
  formInput: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    marginTop: spacing.xs,
  },
  formInputText: {
    ...typography.body,
    color: colors.ink,
  },
  formError: {
    ...typography.caption,
    color: colors.critical,
    marginTop: spacing.sm,
  },
  formButton: {
    marginTop: spacing.xl,
  },
});
