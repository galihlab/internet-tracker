import { useCallback, useRef, useState } from 'react';
import { Animated } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Pill geser beranimasi — dipakai FloatingTabBar (dock) dan
 * PeriodSegmentedControl. Tiap segmen diukur lewat onLayout; pill
 * diterjemahkan ke segmen aktif dengan spring (native driver, 60fps),
 * TANPA Reanimated. Pada pengukuran pertama pill langsung diposisikan
 * (tanpa animasi) supaya tidak ada kilatan saat layar dibuka.
 */
export function useSlidingPill() {
  // Pola yang sama seperti AnimatedBar: Animated.Value disimpan di
  // state (bukan ref) supaya lolos aturan React Compiler.
  const [x] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const positioned = useRef(false);

  const moveTo = useCallback(
    (key: string) => {
      const l = layouts.current[key];
      if (!l) return;
      setWidth((w) => (w === l.width ? w : l.width));
      if (!positioned.current) {
        x.setValue(l.x);
        positioned.current = true;
      } else {
        Animated.spring(x, {
          toValue: l.x,
          useNativeDriver: true,
          // Kaku tapi tidak memantul — terasa "seamless", bukan kenyal.
          stiffness: 420,
          damping: 36,
        }).start();
      }
    },
    [x],
  );

  const handleLayout = useCallback(
    (key: string, isActive: boolean) => (e: LayoutChangeEvent) => {
      const { x: lx, width: w } = e.nativeEvent.layout;
      layouts.current[key] = { x: lx, width: w };
      // Segmen aktif yang baru terukur langsung diposisikan —
      // menutup celah bila moveTo dipanggil sebelum layout ada.
      if (isActive) moveTo(key);
    },
    [moveTo],
  );

  return { x, width, moveTo, handleLayout };
}
