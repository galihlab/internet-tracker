// Daftarkan hook resolve .ts untuk proses pengujian (lihat ts-hooks.mjs).
import { register } from 'node:module';

register('./ts-hooks.mjs', import.meta.url);
