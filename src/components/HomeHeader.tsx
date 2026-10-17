import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  /** Nama dari Pengaturan; string kosong berarti belum diisi. */
  userName: string;
  /** Jumlah peringatan belum dibaca — titik merah lonceng (T4.3). */
  unreadAlerts: number;
  onPressBell: () => void;
  onPressAvatar: () => void;
};

/** Sapaan mengikuti jam perangkat (prinsip 3). */
export function greetingForHour(hour: number): string {
  if (hour >= 4 && hour < 11) return 'Selamat pagi,';
  if (hour >= 11 && hour < 15) return 'Selamat siang,';
  if (hour >= 15 && hour < 18) return 'Selamat sore,';
  return 'Selamat malam,';
}

/** Inisial dari nama: huruf awal dua kata pertama, huruf besar. */
export function initialsForName(name: string): string {
  const kata = name.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return '';
  return kata
    .slice(0, 2)
    .map((k) => k.charAt(0).toUpperCase())
    .join('');
}

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <Path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </Svg>
  );
}

function PersonIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Circle cx="12" cy="8" r="3.5" />
      <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Svg>
  );
}

/**
 * Header Beranda (T1.5): sapaan + nama dari Pengaturan (tanpa nama bila
 * kosong — tidak ada hardcode nama), lonceng ke daftar peringatan, dan
 * avatar inisial nama (ikon generik bila nama kosong). Titik merah lonceng
 * hanya tampil bila ada peringatan belum dibaca.
 */
export default function HomeHeader({ userName, unreadAlerts, onPressBell, onPressAvatar }: Props) {
  const sapaan = greetingForHour(new Date().getHours());
  const inisial = initialsForName(userName);
  const namaBersih = userName.trim();

  return (
    <View style={styles.row}>
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>{sapaan}</Text>
        {namaBersih ? <Text style={styles.nameText}>{namaBersih}</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          style={styles.bell}
          onPress={onPressBell}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Daftar peringatan"
        >
          <BellIcon color={colors.ink} />
          {unreadAlerts > 0 ? <View style={styles.dot} /> : null}
        </Pressable>
        <Pressable
          style={styles.avatar}
          onPress={onPressAvatar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={namaBersih ? `Profil ${namaBersih}` : 'Profil'}
        >
          {inisial ? (
            <Text style={styles.avatarText}>{inisial}</Text>
          ) : (
            <PersonIcon color={colors.primary} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    flex: 1,
  },
  greetingText: {
    ...typography.body,
    color: colors.secondary,
  },
  nameText: {
    ...typography.heading,
    color: colors.ink,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.critical,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.sageActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.heading,
    color: colors.primary,
  },
});
