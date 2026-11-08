import base from './playwright.identity-prism.config.js';
export default { ...base, outputDir: '.local/wording-boundaries-browser-results', use: { ...base.use, baseURL: 'http://127.0.0.1:5292' }, webServer: { ...base.webServer, command: base.webServer.command.replaceAll('5280', '5292').replaceAll('identity-test-dist', 'wording-boundaries-test-dist'), url: 'http://127.0.0.1:5292' } };
