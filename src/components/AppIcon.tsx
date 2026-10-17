import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius, typography } from '../theme';

type Props = {
  /** PNG Base64 dari PackageManager (tanpa prefix data URI), atau null. */
  iconBase64: string | null | undefined;
  /** Label aplikasi — dipakai untuk monogram fallback + aksesibilitas. */
  label: string;
  /** Ukuran kotak ikon dalam dp. */
  size?: number;
};

/**
 * Ikon aplikasi (T3.1): ikon ASLI dari PackageManager bila tersedia,
 * monogram generik (huruf awal dalam lingkaran sage) bila tidak.
 * Monogram bukan logo palsu — tidak pernah menggambar logo aplikasi.
 */
export default function AppIcon({ iconBase64, label, size = 44 }: Props) {
  if (iconBase64) {
    return (
      <Image
        source={{ uri: `data:image/png;base64,${iconBase64}` }}
        style={[styles.image, { width: size, height: size, borderRadius: size * 0.25 }]}
        accessibilityLabel={`Ikon ${label}`}
      />
    );
  }
  const monogram = (label.trim().charAt(0) || '?').toUpperCase();
  return (
    <View
      style={[
        styles.monogram,
        { width: size, height: size, borderRadius: radius.pill },
      ]}
      accessibilityLabel={`Ikon generik ${label}`}
    >
      <Text style={[styles.monogramText, { fontSize: size * 0.4 }]}>{monogram}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.sageLight,
  },
  monogram: {
    backgroundColor: colors.sageActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    ...typography.heading,
    color: colors.primary,
  },
});
