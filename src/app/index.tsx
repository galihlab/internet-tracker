import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppUsageList from '../components/AppUsageList';
import PackageCard from '../components/PackageCard';
import PeriodTabs from '../components/PeriodTabs';
import StatCards from '../components/StatCards';
import UsageRing from '../components/UsageRing';
import { formatGB, GB } from '../lib/format';
import { computeQuota, type QuotaPackage } from '../lib/quota';
import {
  getNativeStatus,
  getUsageSummary,
  getUsageSummaryForRange,
  openUsageAccessSettings,
  periodLabel,
  type Period,
  type UsageSummary,
} from '../lib/usageStats';

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export default function HomeScreen() {
  const [period, setPeriod] = useState<Period>('24h');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [quotaSummary, setQuotaSummary] = useState<UsageSummary | null>(null);
  const [nativeStatus, setNativeStatus] = useState({ available: false, granted: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pkg, setPkg] = useState<QuotaPackage>({
    quotaBytes: 13 * GB,
    startDate: localDateISO(new Date()),
    durationDays: 5,
  });

  const load = useCallback(async (p: Period, q: QuotaPackage) => {
    const [s, qs, ns] = await Promise.all([
      getUsageSummary(p),
      getUsageSummaryForRange(startOfDay(q.startDate), Date.now()),
      getNativeStatus(),
    ]);
    setSummary(s);
    setQuotaSummary(qs);
    setNativeStatus(ns);
  }, []);

  useEffect(() => {
    setLoading(true);
    load(period, pkg).finally(() => setLoading(false));
  }, [period, pkg, load]);

  const quotaState = useMemo(
    () => (quotaSummary ? computeQuota(pkg, quotaSummary.totalBytes) : null),
    [pkg, quotaSummary],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(period, pkg);
    setRefreshing(false);
  }, [load, period, pkg]);

  const onSavePackage = useCallback((quotaGB: number, durationDays: number) => {
    setPkg({ quotaBytes: quotaGB * GB, startDate: localDateISO(new Date()), durationDays });
  }, []);

  const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
  const dailyAvg = summary ? summary.totalBytes / days : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Ringkasan</Text>
        <Pressable onPress={onRefresh} hitSlop={8}>
          <Text style={styles.refresh}>⟳</Text>
        </Pressable>
      </View>

      {summary && (
        <View
          style={[
            styles.badge,
            summary.source === 'native' ? styles.badgeNative : styles.badgeSample,
          ]}
        >
          <Text style={styles.badgeText}>
            {summary.source === 'native'
              ? 'data asli dari perangkat'
              : 'data contoh — dev build + izin akses penggunaan untuk data asli'}
          </Text>
        </View>
      )}

      {nativeStatus.available && !nativeStatus.granted && (
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>
            izinkan akses penggunaan di Settings supaya angka data-nya asli.
          </Text>
          <Pressable style={styles.permissionButton} onPress={openUsageAccessSettings}>
            <Text style={styles.permissionButtonText}>izinkan akses penggunaan</Text>
          </Pressable>
        </View>
      )}

      <PeriodTabs value={period} onChange={setPeriod} />

      {loading || !summary ? (
        <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
      ) : (
        <>
          <UsageRing
            totalBytes={summary.totalBytes}
            quotaBytes={pkg.quotaBytes}
            periodLabel={periodLabel(period)}
          />
          <View style={styles.avgChip}>
            <Text style={styles.avgText}>Rata-rata harian: {formatGB(dailyAvg)}</Text>
          </View>
          <StatCards wifiBytes={summary.wifiBytes} mobileBytes={summary.mobileBytes} />
          {quotaState && <PackageCard pkg={pkg} state={quotaState} onSave={onSavePackage} />}
          <Text style={styles.sectionTitle}>Pemakaian per aplikasi</Text>
          <AppUsageList perApp={summary.perApp} totalBytes={summary.totalBytes} />
          <Text style={styles.footnote}>
            angka seluler/wifi dibaca dari NetworkStatsManager (android). di expo go tampil data
            contoh.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#202124',
  },
  refresh: {
    fontSize: 22,
    color: '#1a73e8',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  badgeNative: {
    backgroundColor: '#e6f4ea',
  },
  badgeSample: {
    backgroundColor: '#fef7e0',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3c4043',
  },
  permissionBox: {
    backgroundColor: '#fce8e6',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 14,
    color: '#3c4043',
  },
  permissionButton: {
    backgroundColor: '#d93025',
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  loader: {
    marginTop: 48,
  },
  avgChip: {
    backgroundColor: '#e8f0fe',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
    marginBottom: 12,
  },
  avgText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a73e8',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#202124',
    marginTop: 20,
    marginBottom: 10,
  },
  footnote: {
    fontSize: 12,
    color: '#80868b',
    marginTop: 16,
    textAlign: 'center',
  },
});
