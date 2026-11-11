// D-82 Player Props, flag ON: a separate cloud-test build with VITE_GTL_PLAYER_PROPS=on (the default cloud-test build keeps
// it off, and tests/cloud-browser/player-props-dark.spec.js checks that nothing shows there). Local fixtures and PGlite only;
// never a hosted request. `npx playwright test --config playwright.player-props.config.js`.
import base from './playwright.cloud.config.js';

process.env.GTL_PLAYER_PROPS_BUILD = 'on';
export default {
  ...base,
  testMatch: /player-props-on\.spec\.js$/,
  outputDir: '.local/player-props-browser-results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5271' },
  webServer: {
    ...base.webServer,
    command: base.webServer.command.replaceAll('5198', '5271').replaceAll('cloud-test-dist', 'player-props-test-dist'),
    env: { ...base.webServer.env, VITE_GTL_PLAYER_PROPS: 'on' },
    url: 'http://127.0.0.1:5271',
  },
};
