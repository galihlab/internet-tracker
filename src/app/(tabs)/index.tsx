import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import HomeHeader from '../../components/HomeHeader';
import InternetTodayCard from '../../components/InternetTodayCard';
import MainQuotaCard from '../../components/MainQuotaCard';
import PredictionCard from '../../components/PredictionCard';
import TodayUsageCard from '../../components/TodayUsageCard';
import TopAppsSummary from '../../components/TopAppsSummary';
import { computeQuota } from '../../lib/quota';
import { useSettings } from '../../lib/settings';
import { useUsage } from '../../lib/usage';
import { formatCapWaktu } from '../../lib/format';
import { openUsageAccessSettings } from '../../lib/usageStats';
import { colors, layout, radius, spacing, typography } from '../../theme';

/**
 * Beranda (v1.2.0, internet-first): header sapaan, kartu utama TOTAL
 * internet hari ini (seluler + Wi-Fi), seksi "Paket seluler" (kartu sisa
 * kuota + prediksi), grafik 7 hari, dan ringkasan tiga aplikasi teratas
 * menurut total internet. Kuota hanya menghitung seluler (prinsip 2):
 * Wi-Fi tidak pernah mengurangi kuota — tapi angka utama Beranda adalah
 * internet, bukan kuota.
 */
export default function BerandaScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const pkg = settings.pkg;
  const { summary, quotaSummary, daily, buckets, unreadAlerts, nativeStatus, loading, refreshing, refresh } = useUsage();

  // Kuota dihitung dari SELULER saja — bukan total gabungan seluler+Wi-Fi.
  // Bucket harian diteruskan untuk prediksi berbobot (T2.3).
  // Tanpa paket aktif, tidak ada kartu kuota (quotaState null).
  const quotaState = useMemo(
    () =>
      pkg && quotaSummary
        ? computeQuota(pkg, quotaSummary.mobileBytes, new Date(), buckets)
        : null,
    [pkg, quotaSummary, buckets],
  );

  // Sumber angka lencana + aplikasi teratas: jendela paket bila ada
  // paket, jendela periode terpilih (bawaan: hari ini) bila tanpa paket.
  const sumber = pkg ? quotaSummary : summary;
  const dataSiap = !loading && (pkg ? quotaSummary !== null : summary !== null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + layout.contentBottomPadding },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <HomeHeader
          userName={settings.userName}
          profilePhoto={settings.profilePhoto}
          // Titik merah lonceng dari peringatan lonjakan belum dibaca (T2.6).
          unreadAlerts={unreadAlerts}
          onPressBell={() => router.push('/alerts')}
          onPressAvatar={() => router.push('/pengaturan')}
        />

        <Text style={styles.title}>
          Internetmu,{'\n'}
          <Text style={styles.titleItalic}>Tetap Terkendali.</Text>
        </Text>

        {sumber && (
          <View
            style={[
              styles.badge,
              sumber.source === 'sample' || sumber.source === 'empty'
                ? styles.badgeSample
                : styles.badgeNative,
            ]}
          >
            <Text style={styles.badgeText}>
              {sumber.source === 'native'
                ? 'Data asli dari perangkat'
                : sumber.source === 'snapshot'
                  ? `Data tersimpan · Terakhir diperbarui ${formatCapWaktu(sumber.updatedAt)}`
                  : sumber.source === 'empty'
                    ? 'Belum ada data tersimpan — beri izin akses penggunaan untuk angka asli'
                    : 'Data contoh — beri izin akses penggunaan untuk data asli'}
            </Text>
          </View>
        )}

        {nativeStatus.available && !nativeStatus.granted && (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              {sumber?.fromSnapshot
                ? 'Izin akses penggunaan belum diberikan — angka memakai data terakhir yang tersimpan.'
                : 'Izin akses penggunaan belum diberikan — belum ada data tersimpan.'}
            </Text>
            <Pressable style={styles.permissionButton} onPress={openUsageAccessSettings} hitSlop={4}>
              <Text style={styles.permissionButtonText}>Buka pengaturan izin</Text>
            </Pressable>
          </View>
        )}

        {!dataSiap ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : (
          <>
            <InternetTodayCard daily={daily} />
            <Text style={styles.sectionTitle}>Paket seluler</Text>
            {pkg && quotaState ? (
              <>
                <MainQuotaCard
                  pkg={pkg}
                  state={quotaState}
                  onPress={() => router.push('/package-detail')}
                />
                <PredictionCard
                  state={quotaState}
                  daily={daily}
                  onPress={() => router.push('/statistik')}
                />
              </>
            ) : (
              <View style={styles.noPackageCard}>
                <Text style={styles.noPackageText}>
                  Belum ada paket aktif. Internet Tracker tetap memantau total internet,
                  per aplikasi, dan pengingat — tapi tanpa paket, tidak ada sisa kuota
                  atau prediksi habis yang bisa ditampilkan.
                </Text>
                <Pressable
                  style={styles.noPackageButton}
                  onPress={() => router.push('/package-detail')}
                  hitSlop={4}
                >
                  <Text style={styles.noPackageButtonText}>Tambah paket</Text>
                </Pressable>
              </View>
            )}
            <TodayUsageCard daily={daily} />
            <TopAppsSummary
              perApp={sumber?.perApp ?? []}
              totalBytes={sumber?.totalBytes ?? 0}
              onPressApp={(app) =>
                router.push({
                  pathname: '/app-detail',
                  params: { packageName: app.packageName, label: app.label },
                })
              }
              onSeeAll={() => router.push('/aplikasi')}
            />
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
    ...typography.display,
    color: colors.ink,
    marginTop: spacing.lg,
  },
  titleItalic: {
    ...typography.displayItalic,
    color: colors.primary,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.ink,
    marginTop: spacing.xl,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
  },
  badgeNative: {
    backgroundColor: colors.sageActive,
  },
  badgeSample: {
    backgroundColor: colors.sageLight,
  },
  badgeText: {
    ...typography.caption,
    color: colors.ink,
  },
  permissionBox: {
    backgroundColor: colors.sageLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  permissionText: {
    ...typography.body,
    color: colors.ink,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  permissionButtonText: {
    ...typography.label,
    color: colors.onPrimary,
  },
  loader: {
    marginTop: 48,
  },
  noPackageCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  noPackageText: {
    ...typography.body,
    color: colors.ink,
  },
  noPackageButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  noPackageButtonText: {
    ...typography.label,
    color: colors.onPrimary,
  },
});
