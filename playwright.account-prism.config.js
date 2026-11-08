import base from './playwright.cloud.config.js';
export default { ...base, outputDir: '.local/account-browser-results', use: { ...base.use, baseURL: 'http://127.0.0.1:5232' }, webServer: { ...base.webServer, command: base.webServer.command.replaceAll('5198','5232').replaceAll('cloud-test-dist','account-test-dist'), url:'http://127.0.0.1:5232' } };
