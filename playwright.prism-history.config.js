import base from './playwright.cloud.config.js';
export default { ...base, use: { ...base.use, baseURL: 'http://127.0.0.1:5252' }, webServer: { ...base.webServer, command: base.webServer.command.replaceAll('5198', '5252'), url: 'http://127.0.0.1:5252' } };
