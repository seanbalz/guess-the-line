import base from './playwright.cloud.config.js';
export default { ...base, use: { ...base.use, baseURL: 'http://127.0.0.1:5264' }, webServer: { ...base.webServer, command: base.webServer.command.replaceAll('5198', '5264'), url: 'http://127.0.0.1:5264' } };
