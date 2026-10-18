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
 * Beranda Fase 1: header sapaan (T1.5), kartu utama sisa kuota (T1.6),
 * kartu Penggunaan Hari Ini (T1.7), kartu Prediksi Kuota (T1.8), dan
 * ringkasan tiga aplikasi teratas (T1.9). Beranda selalu menampilkan
 * keadaan paket saat ini — kontrol periode pindah ke Statistik (T1.10).
 *
 * Satu sumber kebenaran angka (prinsip 1): semua kartu memakai
 * `quotaSummary.mobileBytes` yang sama. Kuota hanya menghitung seluler
 * (prinsip 2): Wi-Fi tidak pernah mengurangi kuota.
 */
export default function BerandaScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const pkg = settings.pkg;
  const { quotaSummary, daily, buckets, unreadAlerts, nativeStatus, loading, refreshing, refresh } = useUsage();

  // Kuota dihitung dari SELULER saja — bukan total gabungan seluler+Wi-Fi.
  // Bucket harian diteruskan untuk prediksi berbobot (T2.3).
  const quotaState = useMemo(
    () => (quotaSummary ? computeQuota(pkg, quotaSummary.mobileBytes, new Date(), buckets) : null),
    [pkg, quotaSummary, buckets],
  );

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
          // Titik merah lonceng dari peringatan lonjakan belum dibaca (T2.6).
          unreadAlerts={unreadAlerts}
          onPressBell={() => router.push('/alerts')}
          onPressAvatar={() => router.push('/pengaturan')}
        />

        <Text style={styles.title}>
          Kuotamu,{'\n'}
          <Text style={styles.titleItalic}>Tetap Terkendali.</Text>
        </Text>

        {quotaSummary && (
          <View
            style={[
              styles.badge,
              quotaSummary.source === 'sample' || quotaSummary.source === 'empty'
                ? styles.badgeSample
                : styles.badgeNative,
            ]}
          >
            <Text style={styles.badgeText}>
              {quotaSummary.source === 'native'
                ? 'Data asli dari perangkat'
                : quotaSummary.source === 'snapshot'
                  ? `Data tersimpan · Terakhir diperbarui ${formatCapWaktu(quotaSummary.updatedAt)}`
                  : quotaSummary.source === 'empty'
                    ? 'Belum ada data tersimpan — beri izin akses penggunaan untuk angka asli'
                    : 'Data contoh — beri izin akses penggunaan untuk data asli'}
            </Text>
          </View>
        )}

        {nativeStatus.available && !nativeStatus.granted && (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              {quotaSummary?.fromSnapshot
                ? 'Izin akses penggunaan belum diberikan — angka memakai data terakhir yang tersimpan.'
                : 'Izin akses penggunaan belum diberikan — belum ada data tersimpan.'}
            </Text>
            <Pressable style={styles.permissionButton} onPress={openUsageAccessSettings} hitSlop={4}>
              <Text style={styles.permissionButtonText}>Buka pengaturan izin</Text>
            </Pressable>
          </View>
        )}

        {loading || !quotaState ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : (
          <>
            <MainQuotaCard
              pkg={pkg}
              state={quotaState}
              onPress={() => router.push('/package-detail')}
            />
            <TodayUsageCard daily={daily} />
            <PredictionCard
              state={quotaState}
              daily={daily}
              onPress={() => router.push('/statistik')}
            />
            <TopAppsSummary
              perApp={quotaSummary?.perApp ?? []}
              mobileTotalBytes={quotaSummary?.mobileBytes ?? 0}
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
});
