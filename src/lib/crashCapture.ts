// Penangkap error diagnostik — SEMENTARA, hanya untuk build v1.0.0-diag1.
// HAPUS file ini beserta pemakaiannya di src/app/_layout.tsx begitu
// diagnosis selesai. Jangan pernah ikut ke rilis reguler.
//
// Cara kerja: handler fatal global React Native (yang biasanya meneruskan
// error ke NativeExceptionsManager dan mematikan aplikasi / force close)
// diganti dengan handler yang MENYIMPAN error-nya saja. Error yang lolos
// dari React (evaluasi modul, async, event handler) tertangkap di sini;
// error render / effect React tertangkap ErrorBoundary di _layout yang
// membaca simpanan yang sama. Dalam kedua jalur, aplikasi TIDAK mati —
// layar error diagnostik tampil supaya pesannya bisa di-screenshot.
//
// Bila aplikasi tetap force close tanpa layar error, berarti crash-nya
// native (sebelum / di luar JS) atau terjadi sebelum modul _layout
// dievaluasi — itu sendiri hasil diagnosisnya.

export type CapturedError = {
  /** `NamaError: pesan`. */
  message: string;
  /** Stack trace, atau '(tanpa stack)' bila tidak ada. */
  stack: string;
  /** True bila RN menandainya fatal. */
  fatal: boolean;
  /** Cap waktu tangkap (epoch ms). */
  at: number;
};

let captured: CapturedError | null = null;
const pendengar = new Set<() => void>();

/** Ubah error apa pun menjadi CapturedError (murni, tanpa efek samping). */
export function toCapturedError(error: unknown, fatal: boolean): CapturedError {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    message: `${err.name}: ${err.message}`,
    stack: err.stack ?? '(tanpa stack)',
    fatal,
    at: Date.now(),
  };
}

/** Error terakhir yang tertangkap handler global, atau null bila belum ada. */
export function getCapturedError(): CapturedError | null {
  return captured;
}

/** Berlangganan perubahan simpanan error. Kembalikan fungsi lepas. */
export function subscribeCrashCapture(fn: () => void): () => void {
  pendengar.add(fn);
  return () => {
    pendengar.delete(fn);
  };
}

/** Simpan error dan beri tahu semua pelanggan (ErrorBoundary). */
export function captureError(error: unknown, fatal: boolean): void {
  captured = toCapturedError(error, fatal);
  pendengar.forEach((fn) => {
    try {
      fn();
    } catch {
      // Pelanggan tidak boleh ikut melempar — diagnosis jalan terus.
    }
  });
}

let terpasang = false;

/**
 * Pasang handler global pengganti. Idempotent. Dipanggil di lingkup modul
 * _layout supaya terpasang sepagi mungkin saat bundle dievaluasi.
 * Sengaja TIDAK meneruskan ke handler asli: handler asli mematikan
 * aplikasi, dan tujuan build diagnostik adalah menampilkan error-nya.
 */
export function installCrashCapture(): void {
  if (terpasang) return;
  terpasang = true;
  const eu = (
    globalThis as unknown as {
      ErrorUtils?: {
        setGlobalHandler: (handler: (error: unknown, isFatal: boolean) => void) => void;
      };
    }
  ).ErrorUtils;
  if (eu && typeof eu.setGlobalHandler === 'function') {
    eu.setGlobalHandler((error, isFatal) => {
      captureError(error, isFatal);
    });
  }
}
