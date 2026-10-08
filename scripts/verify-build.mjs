import { accessSync, readFileSync } from 'node:fs';

const required = [
  'dist/index.html',
  'dist/pruebas/v1/index.html',
  'dist/scribe/scribe.js',
  'dist/scribe/tess/core/tesseract-core-simd-lstm.wasm',
  'dist/tessdata-v2/spa.traineddata.gz',
];

for (const path of required) accessSync(path);
const html = readFileSync('dist/index.html', 'utf8');
const experimentalHtml = readFileSync('dist/pruebas/v1/index.html', 'utf8');
if (!html.includes('/ocr_web/assets/') || !experimentalHtml.includes('/ocr_web/assets/')) {
  throw new Error('La compilación no respeta la ruta base de GitHub Pages.');
}
console.log('Compilación estática verificada.');
