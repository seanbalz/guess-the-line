// Local, in-browser OCR for the commissioner's Sleeper screenshots (EPL stage 3). Loaded only when the commissioner
// chooses screenshots: tesseract.js (Apache-2.0) and its engine and English model (Apache-2.0) are served from this site's
// own /ocr/ folder (vite.config.js copies them from node_modules at build time), so no image, text or request leaves for a
// third party and the main bundle does not grow. Nothing here decides a score: shared/epl-score-import.mjs turns the words
// into candidates for review.
import { extractMatchups } from '../../../../../shared/epl-score-import.mjs';
import { flattenWords } from './eplScoreImportModel.js';

export const OCR_LIMITS = Object.freeze({ files: 12, bytes: 15 * 1024 * 1024 });

/** SHA-256 of the file's bytes as hex: the only trace of a screenshot that is saved. */
export async function sha256Hex(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A greyscale copy for OCR: dark-theme screenshots are inverted to dark text on light, and small images are doubled.
 * Coordinates scale uniformly, which the layout rules (relative sizes and positions) do not depend on.
 */
async function prepare(file) {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width < 900 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width * scale; canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height), px = image.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) { const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = y; sum += y; }
  if (sum / (px.length / 4) < 128) for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Reads each screenshot on this device: [{ sha256, name, result }] with `result` from extractMatchups. `onProgress` gets
 * { file, files, progress } (progress 0..1 for the current file). Throws only when the engine cannot start.
 */
export async function readScreenshots(files, managers, { onProgress } = {}) {
  const list = [...files].slice(0, OCR_LIMITS.files);
  const { createWorker } = await import('tesseract.js');
  const base = new URL('/ocr/', window.location.href).href;
  let current = 0;
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`, corePath: base, langPath: base.replace(/\/$/, ''), workerBlobURL: false, gzip: true,
    logger: m => { if (m?.status === 'recognizing text') onProgress?.({ file: current + 1, files: list.length, progress: Number(m.progress) || 0 }); },
  });
  const out = [];
  try {
    for (const [index, file] of list.entries()) {
      current = index;
      onProgress?.({ file: index + 1, files: list.length, progress: 0 });
      const sha256 = await sha256Hex(file);
      if (file.size > OCR_LIMITS.bytes || !/^image\//.test(file.type)) { out.push({ sha256, name: file.name, result: null, error: 'unsupported' }); continue; }
      try {
        const { data } = await worker.recognize(await prepare(file), {}, { blocks: true, text: false });
        out.push({ sha256, name: file.name, result: extractMatchups({ words: flattenWords(data.blocks), managers }) });
      } catch { out.push({ sha256, name: file.name, result: null, error: 'unreadable' }); }
    }
  } finally { await worker.terminate(); }
  return out;
}
