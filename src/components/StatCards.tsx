import { StyleSheet, Text, View } from 'react-native';
import { formatBytes, formatPercent } from '../lib/format';

type Props = {
  wifiBytes: number;
  mobileBytes: number;
};

export default function StatCards({ wifiBytes, mobileBytes }: Props) {
  const total = wifiBytes + mobileBytes;
  return (
    <View style={styles.row}>
      <View style={styles.card}>
        <View style={styles.labelRow}>
          <View style={[styles.dot, { backgroundColor: '#34a853' }]} />
          <Text style={styles.cardLabel}>Wi-Fi</Text>
        </View>
        <Text style={styles.cardValue}>{formatBytes(wifiBytes)}</Text>
        <Text style={styles.cardPercent}>{formatPercent(wifiBytes, total)}</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.labelRow}>
          <View style={[styles.dot, { backgroundColor: '#1a73e8' }]} />
          <Text style={styles.cardLabel}>Seluler</Text>
        </View>
        <Text style={styles.cardValue}>{formatBytes(mobileBytes)}</Text>
        <Text style={styles.cardPercent}>{formatPercent(mobileBytes, total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardLabel: {
    fontSize: 15,
    color: '#3c4043',
  },
  cardValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#202124',
    marginTop: 8,
  },
  cardPercent: {
    fontSize: 15,
    color: '#1a73e8',
    fontWeight: '600',
    marginTop: 4,
  },
});
