// Hook resolve khusus pengujian Node (T2.8): berkas sumber memakai impor
// relatif tanpa ekstensi (standar Metro/TypeScript), yang tidak bisa
// di-resolve ESM Node. Hook ini mencoba menambahkan '.ts' bila resolve
// bawaan gagal. Hanya dipakai `npm test`; tidak berpengaruh ke aplikasi.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
