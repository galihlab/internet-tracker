// Batang progress beranimasi (T4.4) — memakai Animated bawaan React
// Native, TANPA Reanimated: angka (teks) tampil seketika, hanya
// batang yang bergerak ~400ms menuju nilai baru. Lebar dianimasikan
// lewat JS driver (properti layout tidak bisa native driver).
//
// Cakupan: kartu utama, ringkasan aplikasi (maks 3 baris), dan detail
// paket. Daftar Aplikasi (sampai 200 baris) dan grafik Statistik
// sengaja TIDAK dianimasikan — 200 animasi paralel akan membuat
// scroll tersendat, dan angka di sana harus tampil seketika.

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

type Props = {
  /** Persen terisi (0–100). */
  percent: number;
  /** Tinggi batang (dp). */
  height?: number;
  /** Warna latar batang. */
  backgroundColor?: string;
  /** Warna isi batang. */
  fillColor?: string;
  /** Label aksesibilitas batang (mis. "42% terpakai"). */
  accessibilityLabel?: string;
};

export default function AnimatedBar({
  percent,
  height = 8,
  backgroundColor = colors.sageLight,
  fillColor = colors.progress,
  accessibilityLabel,
}: Props) {
  // Nilai animasi disimpan di state (bukan ref): nilainya dipakai
  // saat render (interpolate) sehingga harus berupa state.
  const [nilai] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(nilai, {
      toValue: Math.max(0, Math.min(100, percent)),
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [percent, nilai]);

  const lebar = nilai.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={[styles.bg, { height, backgroundColor }]}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[styles.fill, { height, backgroundColor: fillColor, width: lebar }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 999,
  },
});
