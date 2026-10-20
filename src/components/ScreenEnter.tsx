import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Animasi masuk layar tab: fade + naik halus setiap kali layar menjadi
 * fokus (pindah tab maupun kembali dari layar detail). Sengaja singkat
 * dan halus (220ms) — terasa seamless, tidak mengganggu.
 */
export default function ScreenEnter({ children }: { children: ReactNode }) {
  // Pola yang sama seperti AnimatedBar: Animated.Value di state.
  const [opacity] = useState(() => new Animated.Value(1));
  const [rise] = useState(() => new Animated.Value(0));

  useFocusEffect(
    useCallback(() => {
      opacity.setValue(0);
      rise.setValue(12);
      const anim = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(rise, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
      anim.start();
      return () => anim.stop();
    }, [opacity, rise]),
  );

  return (
    <Animated.View
      style={[styles.fill, { opacity, transform: [{ translateY: rise }] }]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
