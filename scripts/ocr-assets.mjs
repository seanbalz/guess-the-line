// EPL stage 3: the third-party OCR files the site serves from /ocr/ (vite.config.js copies them at build time). Each is
// a pinned npm package file, served byte for byte: scripts/check-cloud-boundary.mjs accepts one only when it is identical
// to the installed package file, instead of text-scanning megabytes of embedded WebAssembly.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const OCR_ASSETS = Object.freeze({
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
});
export const ocrSource = name => fileURLToPath(new URL(`../node_modules/${OCR_ASSETS[name]}`, import.meta.url));
/** True when `file` is the served copy of a pinned OCR package file, byte for byte. */
export function isPinnedOcrAsset(name, file) {
  if (!Object.hasOwn(OCR_ASSETS, name)) return false;
  try { return fs.readFileSync(file).equals(fs.readFileSync(ocrSource(name))); } catch { return false; }
}
