import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

export default defineConfig({
  testDir: 'tests/accessibility', workers: 1, fullyParallel: false, timeout: 30000,
  outputDir: '.local/accessibility-browser-results',
  use: { baseURL: 'http://127.0.0.1:5195', viewport: { width: 1440, height: 1000 },
    launchOptions: fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {},
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js build --mode cloud-test --manifest --outDir ../.local/accessibility-test-dist && node node_modules/vite/bin/vite.js preview --mode cloud-test --outDir ../.local/accessibility-test-dist --host 127.0.0.1 --port 5195 --strictPort',
    env: { VITE_SUPABASE_URL: 'https://gtl-frontend-check.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_frontend_test_only' },
    url: 'http://127.0.0.1:5195', reuseExistingServer: false }, reporter: 'list',
});
