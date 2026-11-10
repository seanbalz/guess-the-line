import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// EPL stage 3: the commissioner's in-browser screenshot OCR. tesseract.js (Apache-2.0) runs its worker, engine and English
// model from this site's own /ocr/ folder (never a third-party CDN), copied from the pinned npm packages at build time and
// served from node_modules in development. Only the commissioner's import screen ever requests them. web/public/_headers gives
// /ocr/* alone a policy that lets the worker compile WebAssembly ('wasm-unsafe-eval'); every page keeps script-src 'self'.
export const OCR_ASSETS = Object.freeze({
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
});
const ocrSource = name => fileURLToPath(new URL(`./node_modules/${OCR_ASSETS[name]}`, import.meta.url));
function localOcrAssets() {
  return {
    name: 'gtl-local-ocr-assets',
    configureServer(server) {
      server.middlewares.use('/ocr/', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').slice(1).split('?')[0]);
        if (!Object.hasOwn(OCR_ASSETS, name)) return next();
        res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'application/gzip');
        fs.createReadStream(ocrSource(name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of Object.keys(OCR_ASSETS)) this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: fs.readFileSync(ocrSource(name)) });
    },
  };
}

export default defineConfig({ root: 'web', envDir: '..', plugins: [react(), localOcrAssets()], server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' }, fs: { deny: ['**/.git/**', '**/data/**', '**/.local/**', '**/.env*', '**/server/**'] } }, build: { outDir: '../dist', emptyOutDir: true, sourcemap: false } });
