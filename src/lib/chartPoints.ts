/**
 * Bangun string `points` untuk `<Polyline>` react-native-svg dari daftar titik.
 *
 * `points` HANYA berisi pasangan koordinat "x,y" dipisah spasi — TANPA
 * perintah path "M"/"L". react-native-svg membangun atribut `d` sebagai
 * "M" + points, jadi perintah path di dalam `points` menghasilkan
 * "MM12.0 ..." dan parser native melempar:
 *   IllegalArgumentException: Invalid number formating character 'M'
 * yang membuat layar Statistik crash di v1.0.1.
 */
export function buildPolylinePoints(titik: { x: number; y: number }[]): string {
  return titik.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
