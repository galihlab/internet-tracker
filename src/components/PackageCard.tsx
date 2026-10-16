import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatBytes, formatDateID, formatGB, GB } from '../lib/format';
import { statusLabel, type QuotaPackage, type QuotaState } from '../lib/quota';

type Props = {
  pkg: QuotaPackage;
  state: QuotaState;
  onSave: (quotaGB: number, durationDays: number) => void;
};

const STATUS_COLORS: Record<QuotaState['status'], string> = {
  aman: '#1e8e3e',
  mepet: '#e37400',
  kritis: '#d93025',
  habis: '#5f6368',
  'belum-mulai': '#5f6368',
};

export default function PackageCard({ pkg, state, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [quotaGB, setQuotaGB] = useState(String(pkg.quotaBytes / GB));
  const [days, setDays] = useState(String(pkg.durationDays));
  const color = STATUS_COLORS[state.status];

  const save = () => {
    const gb = parseFloat(quotaGB.replace(',', '.'));
    const d = parseInt(days, 10);
    if (Number.isFinite(gb) && gb > 0 && Number.isFinite(d) && d > 0) {
      onSave(gb, d);
      setEditing(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Paket kuota</Text>
        <View style={[styles.chip, { backgroundColor: color }]}>
          <Text style={styles.chipText}>{statusLabel(state.status)}</Text>
        </View>
      </View>

      <Text style={styles.big}>
        {formatBytes(state.remainingBytes)}{' '}
        <Text style={styles.muted}>sisa dari {formatGB(pkg.quotaBytes)}</Text>
      </Text>

      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${state.usedPercent}%`, backgroundColor: color }]} />
      </View>

      <Text style={styles.row}>
        terpakai: {formatBytes(state.usedBytes)} ({Math.round(state.usedPercent)}%)
      </Text>
      <Text style={styles.row}>rata-rata: {formatGB(state.dailyAvgBytes)}/hari</Text>
      <Text style={styles.row}>
        perkiraan habis: {state.projectedRunOut ? formatDateID(state.projectedRunOut) : '—'}
      </Text>
      <Text style={styles.row}>masa aktif berakhir: {formatDateID(state.packageEnd)}</Text>

      {!editing ? (
        <Pressable style={styles.editButton} onPress={() => setEditing(true)}>
          <Text style={styles.editButtonText}>ubah paket</Text>
        </Pressable>
      ) : (
        <View style={styles.editor}>
          <Text style={styles.editorLabel}>kuota (GB)</Text>
          <TextInput
            style={styles.input}
            value={quotaGB}
            onChangeText={setQuotaGB}
            keyboardType="decimal-pad"
          />
          <Text style={styles.editorLabel}>masa aktif (hari)</Text>
          <TextInput
            style={styles.input}
            value={days}
            onChangeText={setDays}
            keyboardType="number-pad"
          />
          <Text style={styles.note}>paket baru mulai hari ini.</Text>
          <Pressable style={styles.saveButton} onPress={save}>
            <Text style={styles.saveButtonText}>simpan paket baru</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#202124',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  big: {
    fontSize: 22,
    fontWeight: '700',
    color: '#202124',
    marginTop: 12,
  },
  muted: {
    fontSize: 14,
    fontWeight: '400',
    color: '#5f6368',
  },
  barBg: {
    height: 8,
    backgroundColor: '#e8eaed',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  row: {
    fontSize: 14,
    color: '#3c4043',
    marginTop: 6,
  },
  editButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  editButtonText: {
    color: '#1a73e8',
    fontWeight: '700',
    fontSize: 14,
  },
  editor: {
    marginTop: 14,
  },
  editorLabel: {
    fontSize: 13,
    color: '#5f6368',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    marginTop: 4,
    color: '#202124',
  },
  note: {
    fontSize: 12,
    color: '#5f6368',
    marginTop: 6,
  },
  saveButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
