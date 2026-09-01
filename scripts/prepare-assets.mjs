import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');
const source = join(root, 'node_modules', 'scribe.js-ocr');
const destination = join(publicDir, 'scribe');

rmSync(destination, { recursive: true, force: true });
rmSync(join(publicDir, 'tessdata-v2'), { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
mkdirSync(join(publicDir, 'tessdata-v2'), { recursive: true });

cpSync(join(source, 'scribe.js'), join(destination, 'scribe.js'));
for (const directory of ['js', 'tess', 'fonts', 'lib']) {
  cpSync(join(source, directory), join(destination, directory), { recursive: true });
}
cpSync(
  join(root, 'node_modules', '@tesseract.js-data', 'spa', '4.0.0', 'spa.traineddata.gz'),
  join(publicDir, 'tessdata-v2', 'spa.traineddata.gz'),
);
