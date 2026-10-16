import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Period } from '../lib/usageStats';

const TABS: { key: Period; label: string }[] = [
  { key: '24h', label: '24 jam terakhir' },
  { key: '7d', label: '7 hari terakhir' },
  { key: '30d', label: '30 hari terakhir' },
];

type Props = {
  value: Period;
  onChange: (p: Period) => void;
};

export default function PeriodTabs({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {TABS.map((t) => {
        const active = value === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: '#f1f3f4',
    borderRadius: 999,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#cfe0f5',
  },
  tabText: {
    fontSize: 13,
    color: '#5f6368',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#1a73e8',
    fontWeight: '700',
  },
});
