import { StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '../lib/format';
import type { AppUsage } from '../lib/usageStats';

type Props = {
  perApp: AppUsage[];
  totalBytes: number;
};

export default function AppUsageList({ perApp, totalBytes }: Props) {
  if (perApp.length === 0) {
    return <Text style={styles.empty}>belum ada data per aplikasi.</Text>;
  }
  return (
    <View style={styles.list}>
      {perApp.map((app) => {
        const percent = totalBytes > 0 ? Math.min(100, (app.bytes / totalBytes) * 100) : 0;
        return (
          <View key={app.packageName} style={styles.row}>
            <View style={styles.rowHeader}>
              <View>
                <Text style={styles.label}>{app.label}</Text>
                <Text style={styles.package}>{app.packageName}</Text>
              </View>
              <Text style={styles.bytes}>{formatBytes(app.bytes)}</Text>
            </View>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${percent}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  row: {
    marginBottom: 14,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
  },
  package: {
    fontSize: 12,
    color: '#80868b',
    marginTop: 2,
  },
  bytes: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
  },
  barBg: {
    height: 6,
    backgroundColor: '#e8eaed',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    backgroundColor: '#1a73e8',
    borderRadius: 3,
  },
  empty: {
    fontSize: 14,
    color: '#5f6368',
  },
});
