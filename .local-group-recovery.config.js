import base from './playwright.cloud.config.js';
export default {
  ...base,
  testMatch: 'prediction-recovery.spec.js',
  outputDir: '.local/group-recovery-results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5194' },
  webServer: { ...base.webServer, url: 'http://127.0.0.1:5194', command: 'node node_modules/vite/bin/vite.js build --mode cloud-test --outDir ../.local/group-recovery-dist && node node_modules/vite/bin/vite.js preview --mode cloud-test --outDir ../.local/group-recovery-dist --host 127.0.0.1 --port 5194 --strictPort' },
};
