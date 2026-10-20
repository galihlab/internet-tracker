import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { Tabs } from 'expo-router';
import { colors, layout, radius, spacing, typography } from '../theme';
import { useSlidingPill } from './useSlidingPill';

// Tipe props bottom bar diambil dari prop `tabBar` milik `Tabs` sendiri:
// expo-router 58 memakai navigator bawaannya (emitter + navigateToTab),
// bukan API `navigation` dari @react-navigation/bottom-tabs.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * Ikon tab garis tipis (digambar dengan SVG, tanpa dependensi ikon baru).
 * Bentuknya mengikuti peran tab: rumah, kisi aplikasi, batang statistik,
 * dan penggeser pengaturan.
 */
function TabIcon({ route, color }: { route: string; color: string }) {
  const props = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (route === 'aplikasi') {
    return (
      <Svg {...props}>
        <Rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <Rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <Rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <Rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </Svg>
    );
  }
  if (route === 'statistik') {
    return (
      <Svg {...props}>
        <Line x1="4" y1="20" x2="4" y2="14" />
        <Line x1="10" y1="20" x2="10" y2="9" />
        <Line x1="16" y1="20" x2="16" y2="12" />
        <Line x1="20" y1="20" x2="20" y2="5" />
        <Line x1="2.5" y1="20" x2="21.5" y2="20" />
      </Svg>
    );
  }
  if (route === 'pengaturan') {
    return (
      <Svg {...props}>
        <Line x1="3" y1="7" x2="21" y2="7" />
        <Line x1="3" y1="17" x2="21" y2="17" />
        <Circle cx="9" cy="7" r="2.2" fill={colors.surface} />
        <Circle cx="15" cy="17" r="2.2" fill={colors.surface} />
      </Svg>
    );
  }
  return (
    <Svg {...props}>
      <Path d="M4 11.5 12 4l8 7.5" />
      <Path d="M6 10v9.5h12V10" />
    </Svg>
  );
}

/**
 * Bottom bar pill melayang sesuai referensi: pill penuh, latar permukaan,
 * tab aktif berlatar sage aktif, mengambang di atas konten dengan jarak
 * dari tepi bawah yang memperhitungkan safe area.
 */
export default function FloatingTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps) {
  // Pill hijau aktif meluncur mengikuti tab (spring, native driver) —
  // tidak lagi "tiba-tiba ada" seperti sebelumnya.
  const { x, width, moveTo, handleLayout } = useSlidingPill();
  const activeKey = state.routes[state.index]?.key;

  useEffect(() => {
    if (activeKey) moveTo(activeKey);
  }, [activeKey, moveTo]);

  return (
    <View
      style={[
        styles.bar,
        {
          bottom: insets.bottom + layout.tabBarBottom,
          marginHorizontal: layout.tabBarMarginX,
        },
      ]}
    >
      {/* Pill indikator — di belakang tab, tidak menangkap sentuhan. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.indicator, { width, transform: [{ translateX: x }] }]}
      />
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label =
          typeof options.title === 'string' ? options.title : route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigateToTab(route.key);
          }
        };

        const onLongPress = () => {
          emitter.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={label}
            onPress={onPress}
            onLongPress={onLongPress}
            onLayout={handleLayout(route.key, isFocused)}
            style={styles.tab}
            hitSlop={4}
          >
            <TabIcon
              route={route.name}
              color={isFocused ? colors.primary : colors.secondary}
            />
            <Text
              style={[
                styles.label,
                { color: isFocused ? colors.primary : colors.secondary },
              ]}
              // Satu baris (T4.5): pada font sistem besar, label tidak
              // membungkus dan merusak susunan bottom bar.
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: layout.tabBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: spacing.sm,
    // Bayangan sangat lembut — pemisah utama adalah ruang, bukan garis.
    elevation: 4,
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  // Pill indikator tab aktif — posisinya digeser oleh useSlidingPill.
  indicator: {
    position: 'absolute',
    top: spacing.sm,
    bottom: spacing.sm,
    left: 0,
    backgroundColor: colors.sageActive,
    borderRadius: radius.pill,
  },
  tab: {
    flex: 1,
    height: '100%',
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  label: {
    ...typography.label,
    fontSize: 11,
    lineHeight: 14,
  },
});
