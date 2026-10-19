import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { formatDateID } from '../lib/format';
import {
  dateISOOf,
  normalizeCustomRange,
  parseDateISO,
  type CustomRange,
} from '../lib/windows';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  /** Rentang aktif (null bila belum pernah dipilih — mulai dari 7 hari terakhir). */
  range: CustomRange | null;
  /** Dipanggil saat pengguna menekan Terapkan. */
  onApply: (range: CustomRange) => void;
};

/**
 * Pemilih rentang tanggal custom untuk Statistik + Aplikasi: dua tombol
 * tanggal (Dari / Sampai) membuka dialog kalender Android, lalu tombol
 * Terapkan memakai rentang itu sebagai periode. Rentang dibatasi 30 hari
 * ke belakang — sama dengan horizon riwayat harian yang dikumpulkan
 * (lihat DEVICE_BUCKET_DAYS di dailyBuckets.ts); grafik Statistik hanya
 * punya bucket sejauh itu.
 */
export default function CustomRangePicker({ range, onApply }: Props) {
  const hariIni = new Date();
  const minTanggal = new Date(
    hariIni.getFullYear(),
    hariIni.getMonth(),
    hariIni.getDate() - 29,
  );
  const bawaanAkhir = range ? parseDateISO(range.endDateISO) : hariIni;
  const bawaanAwal = range
    ? parseDateISO(range.startDateISO)
    : new Date(hariIni.getFullYear(), hariIni.getMonth(), hariIni.getDate() - 6);
  const [awal, setAwal] = useState(bawaanAwal);
  const [akhir, setAkhir] = useState(bawaanAkhir);
  const [memilih, setMemilih] = useState<'awal' | 'akhir' | null>(null);

  const pilihTanggal = (event: DateTimePickerEvent, dipilih?: Date) => {
    setMemilih(null);
    if (event.type === 'dismissed' || !dipilih) return;
    if (memilih === 'awal') setAwal(dipilih);
    if (memilih === 'akhir') setAkhir(dipilih);
  };

  const terapkan = () => {
    const rentang = normalizeCustomRange({
      startDateISO: dateISOOf(awal),
      endDateISO: dateISOOf(akhir),
    });
    onApply(rentang);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          style={styles.dateButton}
          onPress={() => setMemilih('awal')}
          accessibilityRole="button"
          accessibilityLabel={`Tanggal awal, saat ini ${formatDateID(awal)}`}
        >
          <Text style={styles.dateLabel}>Dari</Text>
          <Text style={styles.dateValue}>{formatDateID(awal)}</Text>
        </Pressable>
        <Pressable
          style={styles.dateButton}
          onPress={() => setMemilih('akhir')}
          accessibilityRole="button"
          accessibilityLabel={`Tanggal akhir, saat ini ${formatDateID(akhir)}`}
        >
          <Text style={styles.dateLabel}>Sampai</Text>
          <Text style={styles.dateValue}>{formatDateID(akhir)}</Text>
        </Pressable>
        <Pressable
          style={styles.applyButton}
          onPress={terapkan}
          accessibilityRole="button"
          accessibilityLabel="Terapkan rentang tanggal"
        >
          <Text style={styles.applyText}>Terapkan</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Rentang maksimal 30 hari ke belakang (batas riwayat harian).
      </Text>
      {memilih ? (
        <DateTimePicker
          value={memilih === 'awal' ? awal : akhir}
          mode="date"
          minimumDate={minTanggal}
          maximumDate={hariIni}
          onChange={pilihTanggal}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  dateButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  dateLabel: {
    ...typography.caption,
    color: colors.secondary,
  },
  dateValue: {
    ...typography.body,
    color: colors.ink,
  },
  applyButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyText: {
    ...typography.label,
    color: colors.onPrimary,
  },
  hint: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
});
