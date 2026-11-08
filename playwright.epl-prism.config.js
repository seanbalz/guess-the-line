import { defineConfig } from '@playwright/test';
import cloud from './playwright.cloud.config.js';

// Isolated native EPL visual verification; use the same cloud-test build/auth boundary.
export default defineConfig({
  ...cloud,
  outputDir: '.local/epl-browser-results',
  use: { ...cloud.use, baseURL: 'http://127.0.0.1:5248' },
  webServer: {
    ...cloud.webServer,
    command: cloud.webServer.command.replaceAll('5198', '5248'),
    url: 'http://127.0.0.1:5248',
  },
});
