// Ikon aplikasi asli (T3.1) — cache di perangkat + hook React.
//
// Ikon diambil dari PackageManager lewat modul native (`getAppIcons`),
// lalu disimpan di AsyncStorage sebagai PNG Base64 96x96. Tidak ada ikon
// yang diunduh dari internet. Aplikasi yang sudah di-uninstall tidak
// punya ikon native lagi: entri cache terakhirnya dipertahankan (label
// terakhir yang tercatat + ikon terakhir), dan bila tidak ada cache sama
// sekali, pemanggil menampilkan ikon generik — bukan logo palsu.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppIconInfo } from '../../modules/usage-stats/src/UsageStats.types';
import type UsageStatsModuleInstance from '../../modules/usage-stats';

type UsageStatsModuleType = typeof UsageStatsModuleInstance;

type CachedIcon = {
  label: string;
  /** PNG Base64 atau null bila ikon tidak pernah berhasil dibaca. */
  iconBase64: string | null;
  updatedAt: number;
};

const ICON_CACHE_KEY = '@kuota-tracker:app-icons:v1';

let nativePromise: Promise<UsageStatsModuleType | null> | null = null;

function loadNative(): Promise<UsageStatsModuleType | null> {
  if (!nativePromise) {
    nativePromise = import('../../modules/usage-stats')
      .then((m) => {
        const mod = m.default as unknown as UsageStatsModuleType | undefined;
        return mod && typeof mod.getAppIcons === 'function' ? mod : null;
      })
      .catch(() => null);
  }
  return nativePromise;
}

async function loadCache(): Promise<Record<string, CachedIcon>> {
  try {
    const raw = await AsyncStorage.getItem(ICON_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<CachedIcon>>;
    const hasil: Record<string, CachedIcon> = {};
    for (const [pkg, entri] of Object.entries(parsed)) {
      if (typeof entri?.label === 'string' && 'iconBase64' in entri) {
        hasil[pkg] = {
          label: entri.label,
          iconBase64: typeof entri.iconBase64 === 'string' ? entri.iconBase64 : null,
          updatedAt: typeof entri.updatedAt === 'number' ? entri.updatedAt : 0,
        };
      }
    }
    return hasil;
  } catch {
    return {};
  }
}

async function saveCache(cache: Record<string, CachedIcon>): Promise<void> {
  try {
    await AsyncStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Gagal simpan — ikon tetap tampil dari hasil query native di layar
    // ini; cache lama dipakai pada pembukaan berikutnya.
  }
}

/**
 * Selesaikan ikon untuk daftar nama paket: cache dipakai dulu, yang
 * belum tercache (atau tercache tanpa ikon — mungkin aplikasi baru
 * diinstal ulang) di-query ke native. Aplikasi yang sudah di-uninstall
 * mempertahankan entri cache terakhirnya; tanpa cache, ikonnya null.
 */
export async function resolveAppIcons(
  packageNames: string[],
): Promise<Record<string, AppIconInfo>> {
  const unik = [...new Set(packageNames)].filter((p) => p.length > 0);
  const cache = await loadCache();
  const hasil: Record<string, AppIconInfo> = {};
  const perluQuery: string[] = [];

  for (const pkg of unik) {
    const cached = cache[pkg];
    if (cached && cached.iconBase64) {
      hasil[pkg] = { packageName: pkg, label: cached.label, iconBase64: cached.iconBase64 };
    } else if (cached) {
      // Tercache tanpa ikon — coba lagi ke native (aplikasi mungkin
      // sudah diinstal ulang), tapi entri lama tetap jadi fallback.
      hasil[pkg] = { packageName: pkg, label: cached.label, iconBase64: null };
      perluQuery.push(pkg);
    } else {
      perluQuery.push(pkg);
    }
  }

  if (perluQuery.length > 0) {
    const mod = await loadNative();
    if (mod) {
      try {
        const native = await mod.getAppIcons(perluQuery);
        const sekarang = Date.now();
        let berubah = false;
        for (const info of native) {
          const cached = cache[info.packageName];
          if (info.iconBase64) {
            // Terpasang: label + ikon native adalah kebenaran terbaru.
            hasil[info.packageName] = info;
            cache[info.packageName] = { label: info.label, iconBase64: info.iconBase64, updatedAt: sekarang };
            berubah = true;
          } else if (cached) {
            // Tidak terpasang / tanpa ikon: pertahankan cache terakhir.
            hasil[info.packageName] = {
              packageName: info.packageName,
              label: cached.label,
              iconBase64: cached.iconBase64,
            };
          } else {
            hasil[info.packageName] = {
              packageName: info.packageName,
              label: info.packageName,
              iconBase64: null,
            };
          }
        }
        if (berubah) await saveCache(cache);
      } catch {
        // Query native gagal — hasil dari cache (atau null) tetap dipakai.
      }
    }
    // Tanpa modul native (Expo Go): paket yang belum tercache tetap null.
    for (const pkg of perluQuery) {
      if (!hasil[pkg]) {
        hasil[pkg] = { packageName: pkg, label: pkg, iconBase64: null };
      }
    }
  }

  return hasil;
}

/** Hook: ikon untuk daftar nama paket; kosong sampai cache/query selesai. */
export function useAppIcons(packageNames: string[]): Record<string, AppIconInfo> {
  const kunci = [...new Set(packageNames)].sort().join('\n');
  const [icons, setIcons] = useState<Record<string, AppIconInfo>>({});

  useEffect(() => {
    let aktif = true;
    const daftar = kunci === '' ? [] : kunci.split('\n');
    if (daftar.length === 0) {
      // Tanpa nama paket tidak ada ikon yang dipakai — state awal {}
      // sudah benar, tanpa setState di dalam effect.
      return undefined;
    }
    void resolveAppIcons(daftar).then((hasil) => {
      if (aktif) setIcons(hasil);
    });
    return () => {
      aktif = false;
    };
  }, [kunci]);

  return icons;
}
