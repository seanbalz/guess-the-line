import base from './playwright.cloud.config.js';

// Owned evidence server/output; never reuse another task's preview.
export default {
  ...base,
  outputDir: '.local/research-navigation-results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5296' },
  webServer: {
    ...base.webServer,
    command: 'node node_modules/vite/bin/vite.js build --mode cloud-test --outDir ../.local/research-navigation-dist && node node_modules/vite/bin/vite.js preview --mode cloud-test --outDir ../.local/research-navigation-dist --host 127.0.0.1 --port 5296 --strictPort',
    url: 'http://127.0.0.1:5296',
  },
};
