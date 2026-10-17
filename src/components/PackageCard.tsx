import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import AnimatedBar from './AnimatedBar';
import { formatBytes, formatDateID, formatGB, GB } from '../lib/format';
import {
  durationDaysFromEndDate,
  packageLastDay,
  statusLabel,
  type QuotaPackage,
  type QuotaState,
} from '../lib/quota';
import { dateISOOf, parseDateISO } from '../lib/windows';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  pkg: QuotaPackage;
  state: QuotaState;
  /** Seluler hari ini (dari bucket harian) — untuk perbandingan anggaran. */
  todayMobileBytes?: number;
  /**
   * Simpan paket dari form. `archivePrevious: true` = mulai paket baru
   * (paket aktif diarsipkan ke riwayat); false = ubah paket aktif di
   * tempat. Tanggal mulai dari form dipakai apa adanya — tidak pernah
   * digeser ke hari ini (T2.7).
   */
  onSave: (pkg: QuotaPackage, opts: { archivePrevious: boolean }) => void;
};

const STATUS_COLORS: Record<QuotaState['status'], string> = {
  aman: colors.progress,
  mepet: colors.warning,
  kritis: colors.critical,
  habis: colors.secondary,
  'belum-mulai': colors.secondary,
};

/**
 * Kartu detail paket (T2.4 + T2.5 + T2.7): status berdasarkan laju,
 * anggaran aman harian, dan form siklus hidup paket — nama paket,
 * operator, jaringan, total kuota, tanggal mulai (pemilih tanggal
 * native, boleh kemarin/minggu lalu), dan masa aktif dalam hari ATAU
 * tanggal berakhir.
 */
export default function PackageCard({ pkg, state, todayMobileBytes, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [nama, setNama] = useState(pkg.name);
  const [quotaGB, setQuotaGB] = useState(String(pkg.quotaBytes / GB));
  const [days, setDays] = useState(String(pkg.durationDays));
  const [operator, setOperator] = useState(pkg.operator);
  const [network, setNetwork] = useState(pkg.network);
  const [startDate, setStartDate] = useState(() => parseDateISO(pkg.startDate));
  const [mode, setMode] = useState<'duration' | 'endDate'>('duration');
  const [endDate, setEndDate] = useState(() => packageLastDay(pkg));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const color = STATUS_COLORS[state.status];

  const pilihTanggalMulai = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowStartPicker(false);
    if (selected) setStartDate(selected);
  };

  const pilihTanggalBerakhir = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowEndPicker(false);
    if (selected) setEndDate(selected);
  };

  const save = (archivePrevious: boolean) => {
    const gb = parseFloat(quotaGB.replace(',', '.'));
    const durasi =
      mode === 'duration'
        ? parseInt(days, 10)
        : durationDaysFromEndDate(dateISOOf(startDate), dateISOOf(endDate));
    if (mode === 'endDate' && endDate.getTime() < startDate.getTime()) {
      setError('Tanggal berakhir tidak boleh sebelum tanggal mulai.');
      return;
    }
    if (!Number.isFinite(gb) || gb <= 0) {
      setError('Kuota harus angka lebih dari 0.');
      return;
    }
    if (!Number.isFinite(durasi) || durasi < 1) {
      setError('Masa aktif harus minimal 1 hari.');
      return;
    }
    setError(null);
    // Getar halus (T4.4) — umpan balik bahwa paket tersimpan. Hanya
    // pada simpan yang VALID (bukan saat error validasi).
    Vibration.vibrate(15);
    onSave(
      {
        name: nama.trim() || 'Kuota Utama',
        quotaBytes: gb * GB,
        startDate: dateISOOf(startDate),
        durationDays: durasi,
        operator: operator.trim() || pkg.operator,
        network: network.trim() || pkg.network,
      },
      { archivePrevious },
    );
    setEditing(false);
  };

  // Durasi turunan untuk mode tanggal berakhir (inklusif, T2.7).
  const durasiTurunan =
    mode === 'endDate'
      ? durationDaysFromEndDate(dateISOOf(startDate), dateISOOf(endDate))
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{pkg.name}</Text>
        <View style={[styles.chip, { backgroundColor: color }]}>
          <Text style={styles.chipText}>{statusLabel(state.status)}</Text>
        </View>
      </View>

      <Text style={styles.row}>
        {pkg.operator} • {pkg.network}
      </Text>

      <Text style={styles.big}>
        {formatBytes(state.remainingBytes)}{' '}
        <Text style={styles.muted}>sisa dari {formatGB(pkg.quotaBytes)}</Text>
      </Text>

      <View style={styles.barWrap}>
        <AnimatedBar
          percent={state.usedPercent}
          height={8}
          fillColor={color}
          accessibilityLabel={`${Math.round(state.usedPercent)}% terpakai`}
        />
      </View>

      <Text style={styles.row}>
        terpakai: {formatBytes(state.usedBytes)} ({Math.round(state.usedPercent)}%)
      </Text>
      <Text style={styles.row}>rata-rata: {formatGB(state.dailyAvgBytes)}/hari</Text>
      <Text style={styles.row}>
        perkiraan habis:{' '}
        {!state.forecast.hasEnoughData
          ? 'menunggu satu hari penuh tercatat'
          : state.remainingBytes <= 0
            ? 'kuota habis'
            : state.forecast.projectedRunOut === null ||
                state.forecast.projectedRunOut >= state.packageEnd
              ? 'cukup sampai masa aktif berakhir'
              : state.forecast.borosDate && state.forecast.hematDate
                ? `${formatDateID(state.forecast.borosDate)} – ${formatDateID(state.forecast.hematDate)}`
                : state.forecast.borosDate
                  ? `paling cepat ${formatDateID(state.forecast.borosDate)}`
                  : 'cukup sampai masa aktif berakhir'}
      </Text>
      <Text style={styles.row}>masa aktif berakhir: {formatDateID(state.packageEnd)}</Text>
      {/* Anggaran aman harian (T2.4): sisa kuota / sisa hari. */}
      {state.remainingBytes > 0 && !state.isExpired ? (
        <>
          <Text style={styles.row}>
            Aman dipakai sampai {formatBytes(state.safeDailyBudgetBytes)} per hari
          </Text>
          {todayMobileBytes !== undefined ? (
            <Text style={styles.row}>
              {todayMobileBytes <= 0
                ? 'Hari ini belum ada pemakaian.'
                : todayMobileBytes > state.safeDailyBudgetBytes
                  ? `Hari ini sudah ${formatBytes(todayMobileBytes)} — di atas anggaran.`
                  : todayMobileBytes < state.safeDailyBudgetBytes
                    ? `Hari ini sudah ${formatBytes(todayMobileBytes)} — di bawah anggaran.`
                    : `Hari ini sudah ${formatBytes(todayMobileBytes)} — pas anggaran.`}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.row}>
          Anggaran harian tidak berlaku (kuota habis / masa aktif berakhir).
        </Text>
      )}

      {!editing ? (
        <Pressable style={styles.editButton} onPress={() => setEditing(true)}>
          <Text style={styles.editButtonText}>ubah paket</Text>
        </Pressable>
      ) : (
        <View style={styles.editor}>
          <Text style={styles.editorLabel}>nama paket</Text>
          <TextInput
            style={styles.input}
            value={nama}
            onChangeText={setNama}
            accessibilityLabel="Nama paket"
            placeholder="Kuota Utama"
            placeholderTextColor={colors.secondary}
            maxLength={60}
          />
          <Text style={styles.editorLabel}>kuota (GB)</Text>
          <TextInput
            style={styles.input}
            value={quotaGB}
            onChangeText={setQuotaGB}
            accessibilityLabel="Kuota dalam GB"
            keyboardType="decimal-pad"
          />
          <Text style={styles.editorLabel}>tanggal mulai</Text>
          <Pressable
            style={styles.dateButton}
            onPress={() => setShowStartPicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Pilih tanggal mulai paket"
          >
            <Text style={styles.dateButtonText}>{formatDateID(startDate)}</Text>
          </Pressable>
          {showStartPicker ? (
            <DateTimePicker value={startDate} mode="date" onChange={pilihTanggalMulai} />
          ) : null}
          <Text style={styles.editorLabel}>masa aktif</Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, mode === 'duration' && styles.modeChipActive]}
              onPress={() => setMode('duration')}
              hitSlop={4}
            >
              <Text style={[styles.modeChipText, mode === 'duration' && styles.modeChipTextActive]}>
                Dalam hari
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeChip, mode === 'endDate' && styles.modeChipActive]}
              onPress={() => setMode('endDate')}
              hitSlop={4}
            >
              <Text style={[styles.modeChipText, mode === 'endDate' && styles.modeChipTextActive]}>
                Sampai tanggal
              </Text>
            </Pressable>
          </View>
          {mode === 'duration' ? (
            <>
              <TextInput
                style={styles.input}
                value={days}
                onChangeText={setDays}
                accessibilityLabel="Masa aktif dalam hari"
                keyboardType="number-pad"
              />
              <Text style={styles.note}>
                Berakhir {formatDateID(packageLastDay({ ...pkg, startDate: dateISOOf(startDate), durationDays: parseInt(days, 10) || 1 }))}
                .
              </Text>
            </>
          ) : (
            <>
              <Pressable
                style={styles.dateButton}
                onPress={() => setShowEndPicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Pilih tanggal berakhir paket"
              >
                <Text style={styles.dateButtonText}>{formatDateID(endDate)}</Text>
              </Pressable>
              {showEndPicker ? (
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  minimumDate={startDate}
                  onChange={pilihTanggalBerakhir}
                />
              ) : null}
              <Text style={styles.note}>
                {durasiTurunan !== null ? `= ${durasiTurunan} hari.` : ''}
              </Text>
            </>
          )}
          <Text style={styles.editorLabel}>operator</Text>
          <TextInput
            style={styles.input}
            value={operator}
            onChangeText={setOperator}
            accessibilityLabel="Operator"
          />
          <Text style={styles.editorLabel}>jaringan (mis. 4G/5G)</Text>
          <TextInput
            style={styles.input}
            value={network}
            onChangeText={setNetwork}
            accessibilityLabel="Jaringan, misalnya 4G atau 5G"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.saveButton} onPress={() => save(false)}>
            <Text style={styles.saveButtonText}>simpan perubahan</Text>
          </Pressable>
          <Pressable style={styles.archiveButton} onPress={() => save(true)}>
            <Text style={styles.archiveButtonText}>mulai paket baru</Text>
          </Pressable>
          <Text style={styles.note}>
            Mulai paket baru mengarsipkan paket ini ke riwayat. Tanggal mulai yang dipilih dipakai
            apa adanya — tidak digeser ke hari ini.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.heading,
    color: colors.ink,
    flex: 1,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: {
    color: colors.onPrimary,
    ...typography.label,
  },
  big: {
    ...typography.bigNumber,
    color: colors.ink,
    marginTop: spacing.md,
  },
  muted: {
    ...typography.body,
    color: colors.secondary,
  },
  barWrap: {
    marginTop: spacing.md,
  },
  row: {
    ...typography.body,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  editButton: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  editButtonText: {
    ...typography.label,
    color: colors.primary,
  },
  editor: {
    marginTop: spacing.lg,
  },
  editorLabel: {
    ...typography.label,
    color: colors.secondary,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.sageLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    ...typography.body,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: colors.sageLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  dateButtonText: {
    ...typography.body,
    color: colors.ink,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modeChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.sageLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: colors.sageActive,
    borderColor: colors.sageActive,
  },
  modeChipText: {
    ...typography.label,
    color: colors.secondary,
  },
  modeChipTextActive: {
    color: colors.primary,
  },
  note: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  error: {
    ...typography.body,
    color: colors.critical,
    marginTop: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveButtonText: {
    ...typography.label,
    color: colors.onPrimary,
  },
  archiveButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  archiveButtonText: {
    ...typography.label,
    color: colors.onPrimary,
  },
});
