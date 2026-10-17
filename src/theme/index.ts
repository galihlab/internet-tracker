// Token desain Kuota Tracker — satu sumber kebenaran untuk warna,
// tipografi, radius, dan spasi.
//
// CATATAN: token ini berlaku untuk semua kode BARU / ditulis-ulang mulai
// T0.1. Komponen lama (UsageRing, PackageCard, dst.) masih memakai hex
// warisan sampai diganti di Fase 1, karena Fase 0 dilarang mengubah
// tampilan secara dramatis. Jadi "tidak ada lagi hex di komponen" di
// T0.1 berarti: kode baru tidak menulis hex langsung, melainkan memakai
// token dari modul ini.

/** Palet persis dari rencana improvement (Fase 0, T0.1). */
export const colors = {
  /** Latar utama aplikasi — krem kehijauan sangat muda. */
  background: '#F2F5EF',
  /** Permukaan kartu dan bottom bar. */
  surface: '#FFFFFF',
  /** Sage muda — permukaan aktif yang lembut. */
  sageLight: '#DDE8D9',
  /** Sage aktif — latar tab yang sedang aktif. */
  sageActive: '#C9DDC2',
  /** Hijau utama — aksen dan tombol. */
  primary: '#2F5D3A',
  /** Hijau progress — batang progress dan ring. */
  progress: '#3E7A4E',
  /** Tinta — teks utama dan tombol utama. */
  ink: '#141A15',
  /** Teks sekunder. */
  secondary: '#5C665E',
  /** Peringatan (mepet). T4.5: digelapkan dari #B7791F ke #8A5A00 —
   *  warna lama gagal WCAG AA (3,31 di atas latar, 3,74 untuk teks
   *  putih di atasnya); yang baru lulus dua arah (5,39 teks di atas
   *  latar, 5,93 teks putih di atasnya — diukur rumus luminansi WCAG). */
  warning: '#8A5A00',
  /** Kritis / habis. */
  critical: '#B3261E',
  /** Teks di atas latar gelap (tombol utama, chip status). */
  onPrimary: '#FFFFFF',
  /** Kaca welcome: permukaan putih tembus pandang di atas latar bergelombang. */
  glass: 'rgba(255, 255, 255, 0.78)',
  /** Garis tepi kartu kaca. */
  glassBorder: 'rgba(255, 255, 255, 0.9)',
} as const;

export type Colors = typeof colors;

/**
 * Nama family font persis seperti yang didaftarkan `expo-font` saat
 * memuat paket `@expo-google-fonts/fraunces` dan
 * `@expo-google-fonts/plus-jakarta-sans` (lihat `src/theme/fonts.ts`).
 * Di React Native, bobot font adalah bagian dari nama family — jangan
 * menumpuk `fontWeight` di atas family kustom ini, karena Android akan
 * mensintesis tebal dari face regular.
 */
export const fontFamily = {
  display: 'Fraunces_400Regular',
  displayMedium: 'Fraunces_500Medium',
  displaySemiBold: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  /** Serif italic untuk kata penekanan pada judul. */
  displayItalic: 'Fraunces_400Regular_Italic',
  displayBoldItalic: 'Fraunces_700Bold_Italic',
  sans: 'PlusJakartaSans_400Regular',
  sansMedium: 'PlusJakartaSans_500Medium',
  sansSemiBold: 'PlusJakartaSans_600SemiBold',
  sansBold: 'PlusJakartaSans_700Bold',
} as const;

/** Skala tipografi: ukuran dan tinggi baris untuk tiap peran teks.
 *  T4.5: ukuran font MENGIKUTI pengaturan sistem (allowFontScaling
 *  bawaan React Native, tanpa batas atas) — tidak ada
 *  maxFontSizeMultiplier yang memotong skala sistem. Susunan kartu
 *  dipertahankan lewat flex/wrap dan numberOfLines pada label yang
 *  tidak boleh membungkus (mis. label bottom bar). */
export const typography = {
  /** Judul besar serif, mis. "Kuotamu, Tetap Terkendali." */
  display: {
    fontFamily: fontFamily.displayBold,
    fontSize: 32,
    lineHeight: 38,
  },
  /** Kata penekanan serif italic di dalam judul besar. */
  displayItalic: {
    fontFamily: fontFamily.displayBoldItalic,
    fontSize: 32,
    lineHeight: 38,
  },
  /** Judul layar, mis. "Ringkasan" atau "Pengaturan". */
  title: {
    fontFamily: fontFamily.displayBold,
    fontSize: 28,
    lineHeight: 34,
  },
  /** Judul seksi di dalam layar. */
  heading: {
    fontFamily: fontFamily.sansBold,
    fontSize: 17,
    lineHeight: 22,
  },
  /** Isi biasa. */
  body: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    lineHeight: 21,
  },
  /** Isi yang ditegaskan. */
  bodyBold: {
    fontFamily: fontFamily.sansBold,
    fontSize: 15,
    lineHeight: 21,
  },
  /** Label kecil, mis. label kartu dan chip. */
  label: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  /** Keterangan kecil. */
  caption: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  /** Angka besar, mis. sisa kuota pada kartu utama. */
  bigNumber: {
    fontFamily: fontFamily.sansBold,
    fontSize: 28,
    lineHeight: 34,
  },
} as const;

/** Skala spasi (dp). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** Radius sudut (dp). Kartu besar 24–28, chip/tombol pill penuh. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

/** Ukuran layout yang dipakai bersama antar layar. */
export const layout = {
  /** Tinggi bottom bar pill melayang. */
  tabBarHeight: 64,
  /** Jarak bottom bar dari tepi bawah layar. */
  tabBarBottom: 16,
  /** Jarak bottom bar dari tepi kiri/kanan layar. */
  tabBarMarginX: 16,
  /**
   * Padding bawah konten agar tidak tertutup bottom bar melayang:
   * tinggi bar + jarak bawah + ruang napas.
   */
  contentBottomPadding: 96,
} as const;
