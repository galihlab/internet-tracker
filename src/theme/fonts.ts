import { useFonts } from 'expo-font';
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_700Bold_Italic,
} from '@expo-google-fonts/fraunces';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

/**
 * Muat semua face font yang dipakai token tipografi (`src/theme/index.ts`).
 * Kunci objek di sini harus sama persis dengan nilai `fontFamily` di token,
 * karena kunci itulah yang menjadi nama family di React Native.
 * Dipanggil sekali di root layout; layar tidak boleh tampil sebelum
 * font termuat (splash ditahan sampai pemuatan selesai).
 */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_700Bold_Italic,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
}
