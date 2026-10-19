import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import {
  getAppUsageForRange,
  getNativeStatus,
  getUsageSummary,
  getUsageSummaryForRange,
  periodToRange,
  type AppUsage,
  type Period,
  type UsageSummary,
} from './usageStats';
import { useSettings } from './settings';
import type { QuotaPackage } from './quota';
import { refreshDailyBuckets } from './dailyBuckets';
import type { DailyAppBucket, DailyBucket } from '../../modules/usage-stats';
import { dateISOOf, packageWindow, type CustomRange } from './windows';
import { addAlerts, loadAlerts, markAllAlertsRead, type Alert } from './alerts';
import { detectSpikes } from './spike';
import { runNotificationChecks } from './notificationChecks';

export type NativeStatus = { available: boolean; granted: boolean };

/** Satu hari pada grafik harian: pemakaian seluler hari kalender itu. */
export type DailyUsagePoint = {
  /** Tanggal ISO 'YYYY-MM-DD'. */
  dateISO: string;
  /** Label singkatan Indonesia: Sen/Sel/Rab/Kam/Jum/Sab/Min. */
  label: string;
  mobileBytes: number;
  wifiBytes: number;
  isToday: boolean;
};

/**
 * Data harian untuk kartu Penggunaan Hari Ini (T1.7 + T2.2). Dibaca dari
 * bucket harian ter-cache (snapshot local DB), bukan query
 * per-rentang-hari: kartu tidak pernah memicu query native langsung.
 */
export type DailyUsage = {
  /** Seluler sejak tengah malam hari ini (bucket hari ini, parsial). */
  todayMobileBytes: number;
  /** Seluler kemarin, dari tengah malam sampai jam yang sama dengan sekarang. */
  yesterdaySameHourMobileBytes: number;
  /** 7 hari ke belakang per hari kalender, urut dari yang terlama ke hari ini. */
  last7Days: DailyUsagePoint[];
  /** Pemakaian per aplikasi pada hari ini (dari bucket per aplikasi). */
  perAppToday: DailyAppBucket[];
  source: 'native' | 'sample';
  /** Cap waktu data: waktu segar terakhir / pembuatan contoh. */
  updatedAt: number;
  /** True bila data berasal dari snapshot (query gagal / izin dicabut). */
  fromSnapshot: boolean;
};

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** Label hari singkatan Indonesia untuk sebuah tanggal. */
function dayLabel(date: Date): string {
  return DAY_LABELS[date.getDay()];
}

/**
 * Muat data harian dari bucket ter-cache (T2.2): satu pemanggilan
 * `refreshDailyBuckets` mengembalikan snapshot segar / terakhir / contoh,
 * lalu kartu membaca snapshot itu — tanpa query per-rentang-hari lagi.
 */
async function loadDailyUsage(): Promise<{
  daily: DailyUsage;
  buckets: DailyBucket[];
  perAppDaily: DailyAppBucket[];
  bucketsMeta: BucketsMeta;
}> {
  const now = new Date();
  const data = await refreshDailyBuckets(now);
  const hariIniISO = dateISOOf(now);
  const byDate = new Map(data.buckets.map((b) => [b.dateISO, b]));

  const last7Days: DailyUsagePoint[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateISO = dateISOOf(date);
    const bucket = byDate.get(dateISO);
    last7Days.push({
      dateISO,
      label: dayLabel(date),
      // Bucket yang hilang (mis. belum pernah tersimpan) dibaca 0 —
      // bukan dikarang dari rata-rata.
      mobileBytes: bucket?.mobileBytes ?? 0,
      wifiBytes: bucket?.wifiBytes ?? 0,
      isToday: i === 0,
    });
  }

  return {
    daily: {
      todayMobileBytes: byDate.get(hariIniISO)?.mobileBytes ?? 0,
      yesterdaySameHourMobileBytes: data.yesterdaySameHourMobileBytes,
      last7Days,
      perAppToday: data.perAppDaily.filter((b) => b.dateISO === hariIniISO),
      source: data.source,
      updatedAt: data.updatedAt,
      fromSnapshot: data.fromSnapshot,
    },
    buckets: data.buckets,
    perAppDaily: data.perAppDaily,
    bucketsMeta: {
      firstCollectedAt: data.firstCollectedAt,
      updatedAt: data.updatedAt,
      fromSnapshot: data.fromSnapshot,
      source: data.source,
    },
  };
}

/** Meta pengumpulan bucket harian (T3.6) — untuk keadaan kosong/gagal Statistik. */
export type BucketsMeta = {
  /** Kapan pengumpulan data harian pertama kali tercatat. */
  firstCollectedAt: number;
  /** Cap waktu data bucket terakhir. */
  updatedAt: number;
  /** True bila bucket berasal dari snapshot tersimpan. */
  fromSnapshot: boolean;
  source: 'native' | 'sample';
};

type UsageContextValue = {
  /** Periode yang dipakai bersama Beranda, Aplikasi, dan Statistik. */
  period: Period;
  setPeriod: (p: Period) => void;
  /** Rentang tanggal custom untuk periode 'custom' (null bila belum dipilih). */
  customRange: CustomRange | null;
  /** Atur rentang custom sekaligus pindah ke periode 'custom'. */
  setCustomRange: (r: CustomRange) => void;
  /** Ringkasan pemakaian untuk periode terpilih. */
  summary: UsageSummary | null;
  /** Ringkasan pemakaian sejak tanggal mulai paket (untuk kartu paket). */
  quotaSummary: UsageSummary | null;
  /** Data harian (hari ini, kemarin jam yang sama, 7 hari) untuk kartu hari ini. */
  daily: DailyUsage | null;
  /** Daftar bucket harian (30 hari) — bahan prediksi berbobot (T2.3). */
  buckets: DailyBucket[];
  /** Bucket per aplikasi per hari (30 hari) — bahan rincian hari Statistik (v1.2.0). */
  perAppDaily: DailyAppBucket[];
  /** Meta pengumpulan bucket harian (T3.6). */
  bucketsMeta: BucketsMeta | null;
  /** Daftar per aplikasi LENGKAP untuk periode terpilih (T3.2), terpecah
   *  seluler/Wi-Fi dan terekonsiliasi terhadap total perangkat (T3.3). */
  periodApps: AppUsage[];
  /** Peringatan lonjakan dalam aplikasi (T2.6), terbaru di depan. */
  alerts: Alert[];
  /** Jumlah peringatan belum dibaca — untuk titik merah lonceng. */
  unreadAlerts: number;
  /** Tandai semua peringatan sudah dibaca (dipakai saat /alerts dibuka). */
  markAlertsRead: () => Promise<void>;
  nativeStatus: NativeStatus;
  loading: boolean;
  refreshing: boolean;
  /** Muat ulang data (tarik-untuk-segar). */
  refresh: () => Promise<void>;
};

const UsageContext = createContext<UsageContextValue | null>(null);

/**
 * Satu-satunya tempat tab-tab memuat data perangkat. Berpindah tab tidak
 * memuat ulang data: nilai dipakai bersama dan layar tab tetap terpasang
 * di navigator.
 */
export function UsageProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const pkg = settings.pkg;
  const [period, setPeriod] = useState<Period>('24h');
  const [customRange, setCustomRangeState] = useState<CustomRange | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [quotaSummary, setQuotaSummary] = useState<UsageSummary | null>(null);
  const [daily, setDaily] = useState<DailyUsage | null>(null);
  const [buckets, setBuckets] = useState<DailyBucket[]>([]);
  const [perAppDaily, setPerAppDaily] = useState<DailyAppBucket[]>([]);
  const [bucketsMeta, setBucketsMeta] = useState<BucketsMeta | null>(null);
  const [periodApps, setPeriodApps] = useState<AppUsage[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Rentang custom sekaligus pindah ke periode 'custom' — dua setState
  // ini di-batch React sehingga effect muat-ulang hanya jalan sekali.
  const setCustomRange = useCallback((range: CustomRange) => {
    setCustomRangeState(range);
    setPeriod('custom');
  }, []);

  /**
   * Evaluasi lonjakan (T2.6) dari data harian yang baru dimuat. Hanya
   * berjalan pada data SEGAR asli (bukan snapshot, bukan contoh): data
   * contoh akan memicu peringatan palsu, dan snapshot lama akan membuat
   * peringatan untuk hari yang sudah lewat. Dedup di `addAlerts`
   * mencegah entri ganda tiap refresh.
   */
  const evaluateSpikes = useCallback(
    async (d: DailyUsage, bucketList: DailyBucket[]) => {
      if (d.source !== 'native' || d.fromSnapshot) return;
      const now = new Date();
      const hariIniISO = dateISOOf(now);
      const hariPenuhSebelumnya = bucketList
        .filter((b) => b.dateISO < hariIniISO)
        .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))
        .slice(-7)
        .map((b) => Math.max(0, b.mobileBytes));
      const temuan = detectSpikes({
        todayMobileBytes: d.todayMobileBytes,
        previousFullDaysMobileBytes: hariPenuhSebelumnya,
        perAppToday: d.perAppToday,
        now,
      });
      if (temuan.length > 0) {
        const terbaru = await addAlerts(temuan, now);
        setAlerts(terbaru);
      }
    },
    [],
  );

  const markAlertsRead = useCallback(async () => {
    const ditandai = await markAllAlertsRead();
    setAlerts(ditandai);
  }, []);
  const [nativeStatus, setNativeStatus] = useState<NativeStatus>({
    available: false,
    granted: false,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // `load` mengelola `loading` sendiri (kecuali mode senyap), supaya
  // effect hanya memanggil `load` tanpa setState di dalamnya.
  const load = useCallback(async (p: Period, q: QuotaPackage | null, silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Ringkasan paket memakai JENDELA PAKET (seluler sejak tanggal
      // mulai paket) — bukan jendela periode terpilih (T2.1).
      // Tanpa paket aktif, ringkasan paket dilewati (null).
      const paket = q !== null ? packageWindow(q.startDate) : null;
      const rentangPeriode = periodToRange(p, undefined, customRange);
      const [s, qs, ns, appsPeriode] = await Promise.all([
        getUsageSummary(p, customRange),
        paket !== null
          ? getUsageSummaryForRange(paket.start, paket.end)
          : Promise.resolve(null),
        getNativeStatus(),
        // Daftar lengkap periode terpilih (T3.2): hingga 200 aplikasi.
        getAppUsageForRange(rentangPeriode.start, rentangPeriode.end, 200),
      ]);
      setSummary(s);
      setQuotaSummary(qs);
      setPeriodApps(appsPeriode);
      setNativeStatus(ns);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [customRange]);

  // Pengambilan data perangkat saat periode / paket berubah.
  // Pengecualian aturan set-state-in-effect yang ditargetkan: memuat data
  // dari modul native di effect adalah pola pengambilan data standar di
  // aplikasi ini, bukan sinkronisasi state antar komponen.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(period, pkg);
  }, [period, pkg, load]);

  // Data harian tidak bergantung pada periode/paket — dimuat sekali saat
  // provider dipasang, dan dimuat ulang bersama `refresh`.
  useEffect(() => {
    let aktif = true;
    void loadDailyUsage().then(({ daily: d, buckets: b, perAppDaily: pad, bucketsMeta: m }) => {
      if (aktif) {
        setDaily(d);
        setBuckets(b);
        setPerAppDaily(pad);
        setBucketsMeta(m);
        void evaluateSpikes(d, b);
      }
    });
    return () => {
      aktif = false;
    };
  }, [evaluateSpikes]);

  // Peringatan tersimpan dimuat sekali — evaluasi lonjakan menggabung
  // lewat penyimpanan, jadi urutan kedua effect ini tidak saling timpa.
  useEffect(() => {
    let aktif = true;
    void loadAlerts().then((tersimpan) => {
      if (aktif) {
        setAlerts(tersimpan);
      }
    });
    return () => {
      aktif = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [d] = await Promise.all([loadDailyUsage(), load(period, pkg, true)]);
      setDaily(d.daily);
      setBuckets(d.buckets);
      setBucketsMeta(d.bucketsMeta);
      await evaluateSpikes(d.daily, d.buckets);
    } finally {
      setRefreshing(false);
    }
  }, [load, period, pkg, evaluateSpikes]);

  // Pemeriksaan notifikasi (T4.2 + pengingat internet v1.3.0) saat
  // aplikasi dibuka / data segar dimuat: ambang 50/80/100 + pengingat
  // prediksi kritis + ringkasan harian + batas harian total + batas
  // per aplikasi + pemakaian malam. Tanpa paket aktif, pemeriksaan
  // kuota dilewati — pengingat internet tetap jalan dari data harian.
  // Kunci ref mencegah pemeriksaan ganda untuk data yang sama
  // (mis. render ulang karena alerts berubah). runNotificationChecks
  // sendiri idempotent lewat dedup, jadi kunci ini hanya efisiensi.
  // Bila ada entri baru, daftar peringatan dimuat ulang supaya titik
  // merah lonceng langsung menyala tanpa restart aplikasi.
  const kunciPeriksaTerakhir = useRef<string | null>(null);
  useEffect(() => {
    if (!daily) return;
    const pkg = settings.pkg;
    const hariIni = daily.last7Days.find((d) => d.isToday);
    const kunci = [
      pkg === null
        ? 'tanpa-paket'
        : `${pkg.startDate}|${pkg.quotaBytes}|${pkg.durationDays}`,
      quotaSummary?.updatedAt ?? 'tanpa-ringkasan',
      daily.updatedAt,
      settings.notificationsEnabled,
      settings.notificationThresholds.join(','),
      settings.dailySummaryEnabled,
      settings.dailySummaryHour,
      settings.dailyInternetBudgetBytes,
      settings.perAppBudgets
        .map((b) => `${b.packageName}:${b.budgetBytes}`)
        .join(','),
      settings.overnightAlertEnabled,
    ].join('|');
    if (kunciPeriksaTerakhir.current === kunci) return;
    kunciPeriksaTerakhir.current = kunci;
    void runNotificationChecks({
      settings,
      quotaSummary,
      daily: {
        todayMobileBytes: daily.todayMobileBytes,
        todayWifiBytes: hariIni?.wifiBytes ?? 0,
        perAppToday: daily.perAppToday.map((b) => ({
          packageName: b.packageName,
          label: b.label,
          bytes: b.bytes,
        })),
        source: daily.source,
        fromSnapshot: daily.fromSnapshot,
      },
      buckets,
      now: new Date(),
    }).then(async (hasil) => {
      if (hasil.fired.length > 0) {
        setAlerts(await loadAlerts());
      }
    });
  }, [settings, quotaSummary, daily, buckets]);

  // Kembali dari latar (T4.2: "diperiksa saat aplikasi dibuka"):
  // kembali aktif -> muat ulang data, yang memicu pemeriksaan
  // notifikasi lewat effect di atas. Hanya transisi ke 'active' yang
  // memicu — bukan setiap perubahan status.
  useEffect(() => {
    let sebelumnya = AppState.currentState;
    const sub = AppState.addEventListener('change', (berikutnya) => {
      if (
        (sebelumnya === 'background' || sebelumnya === 'inactive') &&
        berikutnya === 'active'
      ) {
        void refresh();
      }
      sebelumnya = berikutnya;
    });
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo(
    () => ({
      period,
      setPeriod,
      customRange,
      setCustomRange,
      summary,
      quotaSummary,
      daily,
      buckets,
      perAppDaily,
      bucketsMeta,
      periodApps,
      alerts,
      unreadAlerts: alerts.filter((a) => !a.read).length,
      markAlertsRead,
      nativeStatus,
      loading,
      refreshing,
      refresh,
    }),
    [
      period,
      customRange,
      setCustomRange,
      summary,
      quotaSummary,
      daily,
      buckets,
      perAppDaily,
      bucketsMeta,
      periodApps,
      alerts,
      markAlertsRead,
      nativeStatus,
      loading,
      refreshing,
      refresh,
    ],
  );

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

/** Ambil data pemakaian bersama. Harus dipakai di dalam `UsageProvider`. */
export function useUsage(): UsageContextValue {
  const ctx = useContext(UsageContext);
  if (!ctx) {
    throw new Error('useUsage harus dipakai di dalam UsageProvider');
  }
  return ctx;
}
