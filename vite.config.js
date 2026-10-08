import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/ocr_web/',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        stable: resolve(import.meta.dirname, 'index.html'),
        experimentalV1: resolve(import.meta.dirname, 'pruebas/v1/index.html'),
      },
    },
  },
});
