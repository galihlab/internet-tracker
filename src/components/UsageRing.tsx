import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';
import { formatGB } from '../lib/format';

type Props = {
  totalBytes: number;
  quotaBytes: number;
  periodLabel: string;
};

/** Cincin pemakaian: busur biru = porsi kuota yang sudah terpakai. */
export default function UsageRing({ totalBytes, quotaBytes, periodLabel }: Props) {
  const size = 240;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = quotaBytes > 0 ? Math.min(1, totalBytes / quotaBytes) : 0;

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#dbe7f7"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1a73e8"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference * progress} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={styles.label}>Total Penggunaan</Text>
        <Text style={styles.total}>{formatGB(totalBytes)}</Text>
        <Text style={styles.period}>{periodLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    color: '#3c4043',
  },
  total: {
    fontSize: 44,
    fontWeight: '700',
    color: '#202124',
  },
  period: {
    fontSize: 15,
    color: '#5f6368',
    marginTop: 4,
  },
});
